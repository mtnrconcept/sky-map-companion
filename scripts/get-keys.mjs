const token = process.argv[2];
const res = await fetch('https://api.supabase.com/v1/projects/olnkshywagvxzolndtsg/api-keys', {
  headers: { Authorization: 'Bearer ' + token }
});
const keys = await res.json();
keys.forEach(k => console.log(k.name + ':', k.api_key));
