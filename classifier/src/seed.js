// Seed the Supabase companies + theses tables with the starting portfolio.
// Idempotent: companies upsert on ticker; a thesis is inserted only when the
// company has no active thesis yet. Run once at deploy time.

import { config as loadEnv } from 'dotenv';
loadEnv({ override: true });
import { upsertCompany, getActiveThesisFor, insertThesis } from './repo.js';

const portfolio = [
  {
    ticker: 'NVDA', name: 'NVIDIA Corporation', sector: 'Semiconductors',
    thesis: {
      growth_drivers: [
        'Data-center GPU demand from generative-AI workloads grows >40% YoY through 2027.',
        'CUDA developer lock-in keeps software switching costs high.',
      ],
      risks: [
        'Hyperscalers shift to in-house silicon (Trainium, TPU, MTIA), cutting GPU orders.',
        'US export controls tighten and reduce China data-center revenue.',
      ],
      catalysts: [
        'Blackwell platform ramps in volume during fiscal H2.',
        'Sovereign-AI contracts announced with EU and Middle East buyers.',
      ],
      valuation_assumptions: [
        'Data-center gross margin sustains above 70%.',
        'Revenue grows >30% in the next 12 months.',
      ],
      key_metrics: ['Data-center revenue %', 'Gross margin', 'China revenue %'],
    },
  },
  {
    ticker: 'MSFT', name: 'Microsoft Corporation', sector: 'Software',
    thesis: {
      growth_drivers: [
        'Azure AI services drive Azure growth above 30% YoY.',
        'Copilot attach rate on M365 increases ARPU per enterprise seat.',
      ],
      risks: [
        'OpenAI relationship deteriorates or becomes more expensive.',
        'Regulatory action restricts product bundling.',
      ],
      catalysts: [
        'New Copilot SKUs announced at Ignite.',
        'Capex efficiency improvements reduce data-center build cost per token.',
      ],
      valuation_assumptions: [
        'Operating margin remains above 40%.',
        'Azure grows >28% in the next 12 months.',
      ],
      key_metrics: ['Azure growth %', 'Operating margin', 'Capex / revenue'],
    },
  },
  {
    ticker: 'LLY', name: 'Eli Lilly and Company', sector: 'Pharmaceuticals',
    thesis: {
      growth_drivers: [
        'GLP-1 franchise (Mounjaro/Zepbound) expands into new indications.',
        'Manufacturing capacity expansion resolves prior-year supply shortages.',
      ],
      risks: [
        'Compounded GLP-1 alternatives erode pricing power.',
        'Cardiovascular outcomes trial fails to show benefit.',
      ],
      catalysts: [
        'Obesity-related cardiovascular outcomes data readout.',
        'Medicare coverage expansion for obesity treatment.',
      ],
      valuation_assumptions: [
        'GLP-1 revenue grows >50% YoY in the next 12 months.',
        'Operating margin expands as supply constraints ease.',
      ],
      key_metrics: ['GLP-1 revenue', 'Manufacturing capacity', 'Operating margin'],
    },
  },
];

async function seed() {
  for (const p of portfolio) {
    const company = await upsertCompany({ ticker: p.ticker, name: p.name, sector: p.sector });
    const existing = await getActiveThesisFor(company.id);
    if (existing) {
      console.log(`thesis already exists for ${p.ticker}, skipping`);
      continue;
    }
    await insertThesis(company.id, p.thesis);
    console.log(`seeded thesis for ${p.ticker}`);
  }
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('seed failed:', e.message);
    process.exit(1);
  });
