import puppeteer from "puppeteer"

async function processParcels() {
    //read shapefile
    const shapefile = require("shapefile");
    const source = await shapefile.open("./resources/LACounty_Parcels_Shapefile/LACounty_Parcels_1.shp");
    const features = [];

    //iterate through n results
    for (let i = 0; i < 10; i++) {
        let result
        //iterate through results until we find one with an address
        do {
            result = await source.read()
        } while (!result?.value?.properties?.SitusFullA)
        
        // Break if no more features are available
        if (result.done) break;
        
        features.push(result.value);
    }
    console.log("features", features)   
    return features;
}

async function getDeed(address) {
    //launch puppeteer session and navigate to assessor portal
    const browser = await puppeteer.launch({ headless: false })
    const page = await browser.newPage()
    await page.goto(
        "https://portal.assessor.lacounty.gov",
        { waitUntil: 'domcontentloaded' }
    )
    //enter address and search
    let inputField = await page.$('input[name="basicsearchterm"]')
    inputField && await inputField.type(address)
        ; (await page.$('button[title="Search"]')).click()
    await page.waitForSelector('table.table tbody tr', { timeout: 5000 })
    //click on first result
    await page.$eval(
        'table.table tbody tr:first-child',
        (entry) => {
            entry.click()
        })
    await page.waitForSelector('span.ng-binding'); // Wait for the element to be visible

    //click on summary tab
    await page.$eval('span.ng-binding', (element) => {
        if (element.textContent.trim() === 'Summary') {
            element.click();
        }
    });

    await page.waitForSelector('section.eventshistory');

    //click on events history
    await page.$eval('section.eventshistory', (element) => {
        element.click();
    });
    const ownershipDetailsSelector = 'tr[ng-click*="ownership.ShowDetails"]'
    await page.waitForSelector(ownershipDetailsSelector)
    //click on ownership details
    await page.$eval(ownershipDetailsSelector, (element) => {
        element.click();
    });

    const selector = 'td.details dl dd.ng-binding:nth-child(4)'; // Selector for the element containing the document number

    await page.waitForSelector(selector); // Wait for the element to be visible

    //get document number from ownership details table
    const documentNumber = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        return element ? element.textContent.trim() : null;
    }, selector);

    console.log('Document Number:', documentNumber);

    //navigate to netronline and search by document number
    await page.goto(
        "https://datastore.netronline.com/losangeles",
        { waitUntil: 'domcontentloaded' }
    )
    inputField = await page.$('input[name="doc_no"]')
    inputField && await inputField.type(documentNumber)
    await page.click('#la_submit')
    await page.waitForSelector('#la_results table', { timeout: 5000 });

    //add script to replace <br> with | for easier parsing
    await page.addScriptTag({
        content: `
    (function() {
        let nodes = document.querySelectorAll('td');
        nodes.forEach((node) => {
            let children = Array.from(node.childNodes);
            children.forEach((child) => {
                if (child.nodeName === 'BR') {
                    child.textContent = '|';
                }
            });
        });
    })();
` });

    //get most recent deed from results table
    const result = await page.evaluate(() => {
        const deedTypeText = 'DEED';
        const rows = Array.from(document.querySelectorAll('.table tbody tr'));
        let deed = null;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const typeElement = row.querySelector('td:nth-child(3)');
            if (typeElement && typeElement.textContent.includes(deedTypeText)) {
                // extract deed information
                const docNumberElement = row.querySelector('td:nth-child(1) a');
                const grantorElement = row.querySelector('td:nth-child(4)');
                const granteeElement = row.querySelector('td:nth-child(5)');

                const docNumber = docNumberElement ? docNumberElement.textContent.trim() : null;
                const grantors = grantorElement ? grantorElement.textContent.split('|').map(s => s.trim()) : null;
                const grantees = granteeElement ? granteeElement.textContent.split('|').map(s => s.trim()) : null;
                
                deed = { docNumber, grantorText: grantorElement.textContent, grantors, 
                    granteeText: granteeElement.textContent, grantees };
                break;
            }
        }

        return deed;
    });

    console.log('Document Number:', result.docNumber);
    console.log('Rows:', result.rows)
    console.log('Grantor:', result.grantors);
    console.log('Grantee:', result.grantees);

    await browser.close()

    return result
}

processParcels().then(async (features) => {
    for(const feature of features) {
        const address = feature.properties.SitusFullA
        const deed = await getDeed(address)
        console.log("for address", address, "deed", deed)
    }
})