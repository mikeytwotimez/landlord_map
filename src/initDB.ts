import { Pool } from 'pg'

export async function initDb(pool: Pool = new Pool({
    user: 'admin',
    host: 'localhost',
    database: 'property',
    password: 'admin',
    port: 5432
    })) {
    const client = await pool.connect();
    await client.query(`
        CREATE EXTENSION IF NOT EXISTS postgis;

        CREATE TABLE IF NOT EXISTS Property (
            apn TEXT PRIMARY KEY,
            address TEXT,
            geometry GEOMETRY,
            yearBuilt INTEGER,
            effectiveYear INTEGER
        );
    `);

    await client.query(`
        CREATE TABLE IF NOT EXISTS Deed (
            id SERIAL PRIMARY KEY,
            documentNumber TEXT,
            apn TEXT,
            date DATE,
            grantors TEXT[],
            grantees TEXT[],
            FOREIGN KEY (apn) REFERENCES Property (apn)
        );
    `);

    await client.query(`
        CREATE TABLE IF NOT EXISTS PropertyCase (
            apn TEXT,
            caseNumber TEXT PRIMARY KEY,
            caseType TEXT,
            councilDistrict TEXT,
            censusTract TEXT,
            totalUnits INTEGER,
            totalExemptionUnits INTEGER,
            address TEXT,
            inspector TEXT,
            caseManager TEXT,
            regionalOffice TEXT,
            description TEXT,
            activity JSONB,
            FOREIGN KEY (apn) REFERENCES Property (apn)
        );
    `);
    await client.release()
}

initDb()