import { Pool } from 'pg';
import { Property } from './data/Property';

function clampDate(dateStr) {
  // Parse the date string into year, month, and day components
  const [year, month, day] = dateStr.split('-').map(Number);

  // Clamp the year to a reasonable range (e.g., 1492-9999)
  const clampedYear = Math.min(Math.max(year, 1492), 9999);

  // Clamp the month to a valid range (1-12)
  const clampedMonth = Math.min(Math.max(month, 1), 12);

  // Calculate the maximum day for the clamped month and year
  const maxDay = new Date(clampedYear, clampedMonth, 0).getDate();

  // Clamp the day to a valid range (1-maxDay)
  const clampedDay = Math.min(Math.max(day, 1), maxDay);

  // Format the clamped components as a date string
  const clampedDate = `${clampedYear}-${String(clampedMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;

  return clampedDate;
}

const pool = new Pool({
  user: 'admin',
  host: 'localhost',
  database: 'property',
  password: 'admin',
  port: 5432,
});

export async function seed(property: Property) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if a record with the same ID (apn) already exists
    const existingRecord = await client.query('SELECT apn FROM Property WHERE apn = $1', [property.apn]);

    // If no record with the same ID (apn) exists, insert it
    if (existingRecord.rows.length === 0) {
      await client.query(
        'INSERT INTO Property(apn, address, geometry, yearBuilt, effectiveYear) VALUES($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4, $5)',
        [property.apn, property.address, JSON.stringify(property.geometry), property.yearBuilt || 0, property.effectiveYear || 0]
      );
    }

    for (const deed of property.deeds) {
      // Check if a deed with the same documentNumber and apn already exists
      const existingDeed = await client.query('SELECT documentNumber FROM Deed WHERE documentNumber = $1 AND apn = $2', [deed.documentNumber, property.apn]);

      // If a deed with the same documentNumber and apn exists, delete it
      if (existingDeed.rows.length > 0) {
        await client.query('DELETE FROM Deed WHERE documentNumber = $1 AND apn = $2', [deed.documentNumber, property.apn]);
      }

      await client.query(
        'INSERT INTO Deed(documentNumber, apn, date, grantors, grantees) VALUES($1, $2, $3, $4, $5)',
        [deed.documentNumber, property.apn, clampDate(deed.date), deed.grantors, deed.grantees]
      );
    }

    for (const caseItem of property.cases) {
      // Check if a case item with the same caseNumber and apn already exists
      const existingCaseItem = await client.query('SELECT caseNumber FROM PropertyCase WHERE caseNumber = $1 AND apn = $2', [caseItem.caseNumber, property.apn]);

      // If a case item with the same caseNumber and apn exists, delete it
      if (existingCaseItem.rows.length > 0) {
        await client.query('DELETE FROM PropertyCase WHERE caseNumber = $1 AND apn = $2', [caseItem.caseNumber, property.apn]);
      }

      await client.query(
        'INSERT INTO PropertyCase(apn, caseNumber, caseType, councilDistrict, censusTract, totalUnits, totalExemptionUnits, address, inspector, caseManager, regionalOffice, description, activity) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
        [property.apn, caseItem.caseNumber, caseItem.caseType, caseItem.councilDistrict, caseItem.censusTract, caseItem.totalUnits, caseItem.totalExemptionUnits, caseItem.address, caseItem.inspector, caseItem.caseManager, caseItem.regionalOffice, caseItem.description, JSON.stringify(caseItem.activity)]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}