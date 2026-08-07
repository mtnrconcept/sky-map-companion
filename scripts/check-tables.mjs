const token = process.argv[2];
const res = await fetch('https://api.supabase.com/v1/projects/olnkshywagvxzolndtsg/database/query', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name" })
});
const j = await res.json();
j.forEach(r => console.log(' ?', r.table_name));
