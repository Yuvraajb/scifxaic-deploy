const multer = require('multer');
const supabaseAdmin = require('../lib/supabaseAdmin');
const { saveInvestment } = require('../handlers/investments');
const { processFileBuffer } = require('../handlers/upload');
const { safeAddToWatchlist } = require('../handlers/watchlist');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' });
  const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', user.id).single();
  if (!profile) return res.status(403).json({ error: 'Access denied' });
  req.user = user;
  req.profile = profile;
  next();
}

function requireGod(req, res, next) {
  if (req.profile?.role !== 'god') return res.status(403).json({ error: 'Forbidden' });
  next();
}

function registerApiRoutes(router) {
  // ── POST /api/upload ──────────────────────────────────────────────────────
  router.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file provided' });

      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (!['pdf', 'pptx'].includes(ext)) return res.status(400).json({ error: 'Only PDF and PPTX supported' });

      const { ticker: extractedTicker, thesis, structuredThesis } = await processFileBuffer({
        buffer: file.buffer,
        fileType: ext,
      });

      const ticker = req.body.ticker || extractedTicker;
      const companyName = req.body.companyName || ticker;
      const sector = req.body.sector || null;

      // Upload file to Supabase Storage
      let fileUrl = null;
      const storagePath = `${Date.now()}-${ticker}.${ext}`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from('pitch-decks')
        .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
      if (!uploadErr) {
        const { data: urlData } = supabaseAdmin.storage.from('pitch-decks').getPublicUrl(storagePath);
        fileUrl = urlData?.publicUrl || null;
      }

      await saveInvestment({
        ticker,
        companyName,
        sector,
        thesis,
        fileUrl,
        slackIds: [],
        attribution: { deckCreator: req.profile.name || req.user.email },
      });

      const watchlisted = await safeAddToWatchlist({
        ticker,
        companyName,
        sector,
        thesis,
        structuredThesis,
      });

      res.json({ ok: true, ticker, thesis, watchlisted });
    } catch (err) {
      console.error('[API UPLOAD ERROR]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/invite ──────────────────────────────────────────────────────
  // ── DELETE /api/decks/:id ─────────────────────────────────────────────────
  // Remove a deck end-to-end: tracker row, its storage file, and — when it was
  // the ticker's only deck — deactivate the company so the classifier stops
  // watching it (mirror of the upload path's safeAddToWatchlist). Company and
  // articles are kept (active=false) so classification history stays intact.
  router.delete('/api/decks/:id', requireAuth, async (req, res) => {
    try {
      const { data: deck, error: loadErr } = await supabaseAdmin
        .from('investment_tracker')
        .select('id, ticker, file_url')
        .eq('id', req.params.id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!deck) return res.status(404).json({ error: 'Deck not found' });

      const { error: delErr } = await supabaseAdmin
        .from('investment_tracker')
        .delete()
        .eq('id', deck.id);
      if (delErr) throw delErr;

      // Best-effort: remove the stored file. The public URL ends with the
      // storage path after "/pitch-decks/".
      if (deck.file_url) {
        const storagePath = deck.file_url.split('/pitch-decks/').pop();
        if (storagePath) {
          const { error: fileErr } = await supabaseAdmin.storage
            .from('pitch-decks')
            .remove([storagePath]);
          if (fileErr) console.warn('[DECK DELETE] file removal failed:', fileErr.message);
        }
      }

      // Stop watching the company if no deck remains for its ticker.
      const ticker = deck.ticker.trim().toUpperCase();
      const { count } = await supabaseAdmin
        .from('investment_tracker')
        .select('*', { count: 'exact', head: true })
        .ilike('ticker', ticker);
      if (count === 0) {
        await supabaseAdmin.from('companies').update({ active: false }).eq('ticker', ticker);
      }

      res.json({ ok: true, ticker, unwatched: count === 0 });
    } catch (err) {
      console.error('[DECK DELETE ERROR]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/invite', requireAuth, requireGod, async (req, res) => {
    try {
      const { email, name, slackUserId, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'email and password required' });

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw new Error(error.message);

      await supabaseAdmin.from('profiles').insert({
        id: data.user.id,
        email,
        name: name || null,
        role: 'member',
        slack_user_id: slackUserId || null,
        subscribed_sectors: [],
      });

      res.json({ ok: true, id: data.user.id });
    } catch (err) {
      console.error('[API INVITE ERROR]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/users ─────────────────────────────────────────────────────────
  router.get('/api/users', requireAuth, requireGod, async (req, res) => {
    const { data, error } = await supabaseAdmin.from('profiles').select('*').order('created_at');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // ── DELETE /api/users/:id ──────────────────────────────────────────────────
  router.delete('/api/users/:id', requireAuth, requireGod, async (req, res) => {
    try {
      await supabaseAdmin.from('profiles').delete().eq('id', req.params.id);
      await supabaseAdmin.auth.admin.deleteUser(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── PUT /api/users/:id/sectors ─────────────────────────────────────────────
  router.put('/api/users/:id/sectors', requireAuth, requireGod, async (req, res) => {
    const { sectors } = req.body;
    const { error } = await supabaseAdmin.from('profiles').update({ subscribed_sectors: sectors }).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  // Health check endpoint for Render deploy readiness.
  router.get('/health', (req, res) => {
    res.send('OK');
  });
}

module.exports = registerApiRoutes;
