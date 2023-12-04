import { Client } from 'pg'

export async function clearDB() {
    const client = new Client({
        user: 'admin',
        host: 'localhost',
        database: 'property',
        password: 'admin',
        port: 5432,
    })
    
    await client.connect()

    await client.query(`
        DROP TABLE IF EXISTS Deed;
    `)
    await client.query(`
        DROP TABLE IF EXISTS PropertyCase;
    `)
    await client.query(`
        DROP TABLE IF EXISTS Property;
    `)
    await client.end()
}
clearDB()