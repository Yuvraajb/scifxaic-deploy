// Throws a namespaced error if a Supabase query result carries one, else
// returns the result's data. Mirrors classifier/src/repo.js's unwrap().
function assertNoSupabaseError(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

module.exports = assertNoSupabaseError;
