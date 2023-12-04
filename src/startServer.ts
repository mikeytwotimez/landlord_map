import express from 'express'
import cors from 'cors'
import { Pool } from 'pg'

const app = express();
app.use(cors())
const pool: Pool = new Pool({
    user: 'admin',
    host: 'localhost',
    database: 'property',
    password: 'admin',
    port: 5432
    })

app.get('/property/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM property WHERE id = $1', [req.params.id]);
  res.json(result.rows[0]);
});

app.get('/property', async (req, res) => {
  // Example of a simple query - you'd want to add WHERE clauses based on the search criteria
  const result = await pool.query(`SELECT *, ST_AsGeoJSON(geobin)::json AS geometry
  FROM (
      SELECT *, geometry AS geobin FROM Property
  ) sub
  `);

  const processedResult = result.rows.map(({ geobin, ...rest }) => rest)

  res.json(processedResult);
});

app.listen(3000, () => console.log('Server running on port 3000'));
