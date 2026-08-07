const token = process.argv[2];
const PROJECT = 'olnkshywagvxzolndtsg';

const sql = `
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('astro-frames', 'astro-frames', true, 524288000),
       ('astro-masters', 'astro-masters', true, 104857600)
ON CONFLICT (id) DO NOTHING;
`;

const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const txt = await r.text();
console.log(r.status, txt);
