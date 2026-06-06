const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'https://cafefluent.dandr.org',
}

export const handler = async () => ({
  statusCode: 200,
  headers: CORS,
  body: JSON.stringify({
    enabledModules: ['allergens', 'bread', 'coffee'],
  }),
})
