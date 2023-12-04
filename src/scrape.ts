import puppeteer from "puppeteer"
import { Property } from "./data/Property"
import { Deed } from "./data/Deed"
import { ParcelData } from "./data/ParcelData"
import { PropertyCase } from "./data/PropertyCase"
import { seed } from "./seed"


async function processParcels(shpPath: string): Promise<ParcelData[]> {
    //read shapefile
    const shapefile = require("shapefile")
    const source = await shapefile.open(shpPath);
    const features = [] as ParcelData[]
    //iterate through n results
    for (let i = 0; i < 10; i++) {
        //skip first 10
        await source.read()
    }
    for (let i = 0; i < 1000; i++) {
        let loaded
        let result: ParcelData
        //iterate through results until we find one with an address
        do {
            loaded = await source.read()
            result = loaded.value
        } while (
            !result?.properties?.SitusFullA ||
            !((result?.properties?.UseCode ?? "") === '0500'))
        // Break if no more features are available
        if (loaded.done) break;
        features.push(result);
    }
    return features;
}



async function findDeedsInResults(page, deedData: { apn: string }, targetDate = ''): Promise<Deed[]> {
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
        `
    })


    // Get the list of <a> elements within the ul
    let linkHandles: any = [null]
    try {
        await page.waitForSelector('#la_results ul.pagination', { timeout: 15000 });
        linkHandles = await page.$$('#la_results ul.pagination li.page-item a.page-link')
    } catch (e) {
        console.log("no pagination")
    }
    //get most recent deed from results table
    const result = []
    for (let i = 0; i < linkHandles.length; i++) {
        let linkHandle = linkHandles[i]
        if (linkHandle !== null) {
            // redo selection to get fresh handle
            linkHandle = (await page.$$('#la_results ul.pagination li.page-item a.page-link'))[i]
            await linkHandle.click();
            // Wait for the page to load after the click
            await page.waitForFunction(() => {
                const img = document.getElementById('la_wait');
                if (img) {
                    const style = window.getComputedStyle(img);
                    return style.getPropertyValue('display') === 'none';
                }
                return false; // Return false if the element is not found
            }, { timeout: 15000 });
        }

        result.push(...await page.evaluate((targetDate, deedData) => {
            function datesEqual(date0: string, date1: string) {
                const formattedDate0 = date0.replace(/[-\/]+/g, '-')
                const formattedDate1 = date1.replace(/[-\/]+/g, '-')
                const pieces0 = formattedDate0.split('-')
                const pieces1 = formattedDate1.split('-')
                const yearsEqual = pieces0[0] === pieces1[2]
                const monthsEqual = pieces0[1] === pieces1[0]
                const daysEqual = pieces0[2] === pieces1[1]
                return yearsEqual && monthsEqual && daysEqual
            }
            const deedTypeText = 'DEED';
            const rows = Array.from(document.querySelectorAll('.table tbody tr'));
            let deeds: Deed[] = []
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const typeElement = row.querySelector('td:nth-child(3)');
                if (typeElement && typeElement.textContent.includes(deedTypeText)) {
                    // extract deed information
                    const docNumberElement = row.querySelector('td:nth-child(1)')
                    const dateElement = row.querySelector('td:nth-child(2)')
                    if (targetDate && !datesEqual(dateElement.textContent.trim(), targetDate)) continue
                    const grantorElement = row.querySelector('td:nth-child(4)')
                    const granteeElement = row.querySelector('td:nth-child(5)')

                    const documentNumber = docNumberElement ? docNumberElement.textContent.trim() : null

                    const date = dateElement ? dateElement.textContent.trim() : null
                    const grantors = grantorElement ? grantorElement.textContent.split('|').map(s => s.trim()) : null
                    const grantees = granteeElement ? granteeElement.textContent.split('|').map(s => s.trim()) : null

                    deeds.push({
                        ...deedData,
                        documentNumber,
                        date,
                        grantors,
                        grantees
                    })
                }
            }

            return deeds
        }, targetDate, deedData))
    }
    return result
}

function convertDate(date: string) {
    const pieces = date.split('/')
    return `${pieces[2]}-${pieces[0]}-${pieces[1]}`
}

async function getDeed(feature): Promise<Deed[]> {
    const address = feature.properties.SitusFullA
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
    await page.waitForSelector('table.table tbody tr', { timeout: 15000 })
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


    // Extract the data from the table
    const data = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr.ng-scope')); // Select all rows
        return rows.map(row => {
            if (!row.querySelector('td:nth-child(2)')) return { documentNumber: '', date: '' }
            const date = row.querySelector('td:nth-child(2)').textContent.trim(); // Get the date from the second column
            const detailsRow = row.nextElementSibling; // Get the details row
            let documentNumber = '';
            if (detailsRow && detailsRow.querySelector('dd:nth-child(4)')) {
                documentNumber = detailsRow.querySelector('dd:nth-child(4)').textContent.trim(); // Get the document number
            }
            return { documentNumber, date };
        }).filter(entry => entry.documentNumber !== ''); // Remove entries with no document number
    });

    //get document number from ownership details table
    const documentNumber = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        return element ? element.textContent.trim() : null;
    }, selector);

    //navigate to netronline
    await page.goto(
        "https://datastore.netronline.com/losangeles",
        { waitUntil: 'domcontentloaded' }
    )
    //first search by AIN
    inputField = await page.$('input[name="ain"]')
    inputField && await inputField.type(feature.properties.AIN)
    await page.click('#la_submit')
    const result: Deed[] = []
    try {
        await Promise.race([
            page.waitForSelector('#la_results table', { timeout: 15000 }),
            page.waitForFunction(() => {
                const noDocumentsElement = document.querySelector('#la_results');
                return noDocumentsElement && noDocumentsElement.textContent.includes('No documents found.');
            }, { timeout: 15000 }).then(() => {
                throw new Error('No documents found');
            }),
        ]);

        result.push(...(await findDeedsInResults(page, { apn: feature.properties.AIN })));
    } catch (e) {
        if (e.message === 'No documents found') {
            console.log('No documents found for AIN ' + feature.properties.AIN);
        } else {
            // Handle other errors
            console.error(e);
        }
    }

    //now search by document number
    for (const entry of data) {
        await page.goto(
            "https://datastore.netronline.com/losangeles",
            { waitUntil: 'domcontentloaded' }
        )
        //search by document number
        inputField = await page.$('input[name="doc_no"]')
        inputField && await inputField.type(entry.documentNumber)
        await page.click('#la_submit')

        try {
            await page.waitForSelector('#la_results table', { timeout: 15000 });
            const deeds = await findDeedsInResults(page, { apn: feature.properties.AIN }, entry.date)
            //if we cannot find a deed with the specified date,
            //and none already exist add a dud deed with no grantors or grantees
            if (deeds.length === 0 && !result.find(deed => deed.date === convertDate(entry.date))) {
                deeds.push({
                    apn: feature.properties.AIN,
                    documentNumber: entry.documentNumber,
                    date: convertDate(entry.date),
                    grantors: [],
                    grantees: []
                })
            }
            for (const deed of deeds) {
                const existingDeed = result.find(d => d.documentNumber === deed.documentNumber)
                if (existingDeed) {
                    //check which deed has more information
                    if (existingDeed.grantors.length < deed.grantors.length) {
                        existingDeed.grantors = deed.grantors
                    }
                    if (existingDeed.grantees.length < deed.grantees.length) {
                        existingDeed.grantees = deed.grantees
                    }
                    continue
                }
                result.push(deed)
            }
        } catch (e) {
            console.log('No results found for document number ' + entry.documentNumber + ' and date ' + entry.date + ' for AIN ' + feature.properties.AIN);
            //there may be some deeds that are not in the netronline database. add a dud deed with no grantors or grantees
            result.push({
                apn: feature.properties.AIN,
                documentNumber: entry.documentNumber,
                date: convertDate(entry.date),
                grantors: [],
                grantees: []
            })
        }
    }
    await browser.close()
    return result
}

async function setCountToAll(page, countSelector) {
    try {
        await page.waitForSelector(countSelector, {
            timeout: 1000
        })
        const countElement = await page.$(countSelector)
        await countElement.select('-1')
    } catch (e) {
        console.log("no count selector")
    }
}

async function getPropertyActivity(feature): Promise<PropertyCase[]> {
    const browser = await puppeteer.launch({ headless: false })
    const page = await browser.newPage()
    await page.goto(
        "https://housingapp.lacity.org/reportviolation/Pages/PropActivity",
        { waitUntil: 'domcontentloaded' }
    )
    const streetNumberInput = await page.$('input[name="StreetNo"]')
    const streetNameInput = await page.$('input[name="StreetName"]')
    await streetNumberInput.type(feature.properties.SitusHouse)
    const streetName = trimStreetName(feature.properties.SitusStree)
    await streetNameInput.type(streetName)
        ; (await page.$('button[type="submit"]')).click()
    try {
        await page.waitForSelector('#dgProperty2_wrapper', { timeout: 15000 })
    } catch (e) {
        console.log('no results found')
        await browser.close()
        return []
    }
    const linkSelector = `#dgProperty2_lnkSelectProp_0`
    await page.waitForSelector(linkSelector)
    const link = await page.$(linkSelector)
    await link.click()
    await page.waitForSelector("div[id='dgPropCases2_wrapper']")
    await setCountToAll(page, 'select[name="dgPropCases2_length"]')
    const rowCount = await page.$$eval('table#dgPropCases2 > tbody > tr', (rows) => rows.length);

    const result: PropertyCase[] = []
    // Iterate through each row and click on the link with the indexed ID
    for (let i = 0; i < rowCount; i++) {
        const linkSelector = `#dgPropCases2_lnkSelectCase_${i}`;
        await page.waitForSelector(linkSelector);
        const link = await page.$(linkSelector);
        await page.waitForTimeout(500)
        await link.click()
        await page.waitForNavigation();
        // Wait for the element to be visible
        await page.waitForSelector('#lnkbtnPropAddr');
        // Extract the APN
        const apn = await page.$eval('#lblAPN', (element) => element.textContent.trim())
        // Extract the census tract
        const censusTract = await page.$eval('#lblCT', (element) => element.textContent.trim());
        // Extract the council district
        const councilDistrict = await page.$eval('#lblCD', (element) => element.textContent.trim());
        // Extract the regional office
        const regionalOffice = await page.$eval('#lblCodeOffice', (element) => element.textContent.trim());
        // Extract the address
        const address = await page.$eval('#lnkbtnPropAddr', (element) => element.textContent.trim());
        // Extract the case number
        const caseNumber = await page.$eval('#lblCaseNo', (element) => element.textContent.trim());
        // Extract the case type
        const caseType = await page.$eval('#lblSource', (element) => element.textContent.trim());
        // Extract the case manager
        const caseManager = await page.$eval('#lblCaseManager', (element) => element.textContent.trim());
        // Extract the inspector
        const inspector = await page.$eval('#lblInspectorName', (element) => element.textContent.trim());
        // Extract the nature of complaint
        let description = ""
        try {
            description = await page.$eval('#lblComplaintNature', (element) => element?.textContent.trim() || "");
        } catch (e) { }
        // Extract total units
        const totalUnits = await page.$eval('#ttlUnits', (element) =>
            Number.parseInt(element.textContent.trim() || '0'))
        // Extract total exemption units
        const totalExemptionUnits = await page.$eval('#lblTotalExemptionUnits', (element) =>
            Number.parseInt(element.textContent.trim() || '0'))

        await setCountToAll(page, 'select[name="dgDisplayDates2_length"]')
        // Wait for the table to be visible
        const tableSelector = 'table#dgDisplayDates2 > tbody > tr'
        await page.waitForSelector(tableSelector);
        // Extract data from the table
        const activity = await page.$$eval(tableSelector, (rows) => {
            return rows.map((row, i) => {
                const date = row.querySelector('td:nth-child(1)')?.textContent.trim();
                const status = row.querySelector('td:nth-child(2)')?.textContent.trim();
                return { date, status };
            });
        });
        result.push({
            apn,
            address,
            censusTract,
            councilDistrict,
            regionalOffice,
            caseType,
            caseManager,
            caseNumber,
            inspector,
            totalUnits,
            totalExemptionUnits,
            description,
            activity
        })
        // Go back to the table for the next iteration
        await page.goBack()
        await page.reload()
        await setCountToAll(page, 'select[name="dgPropCases2_length"]')
    }
    await browser.close()
    return result
}

async function getPermitInspectionData(feature) {
    const browser = await puppeteer.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(
        "https://www.ladbsservices2.lacity.org/OnlineServices/OnlineServices/OnlineServices?service=plr",
        { waitUntil: 'domcontentloaded' }
    )
    const streetNumberInput = await page.$('input[name="StreetNumber"]')
    const streetNameInput = await page.$('input[name="StreetNameSingle"]')
    await streetNumberInput.type(feature.properties.SitusHouse)
    const streetName = trimStreetName(feature.properties.SitusStree)
    await streetNameInput.type(streetName)
    //;(await page.$('input[type="submit"]')).click()

}

function trimStreetName(streetName) {
    //remove prefixes N, S, E, W
    let result = streetName.replace(/^[NSWE]\s/, '')
    //remove suffixes Dr, St, Ave, Blvd, Ln, Ct, Pl, Rd, Way, Cir, Trl, Sq, Ter, Pkwy, Hwy case insensitive
    result = result.replace(/\s(Dr|St|Ave|Blvd|Ln|Ct|Pl|Rd|Way|Cir|Trl|Sq|Ter|Pkwy|Hwy)$/i, '')
    return result
}

export async function scrape(shapefile: string) {
    processParcels(shapefile).then(async (features) => {
        for (const feature of features) {
            const deeds = await getDeed(feature)
            const cases = await getPropertyActivity(feature)
            const property: Property = {
                address: feature.properties.SitusFullA,
                apn: feature.properties.AIN,
                geometry: feature.geometry,
                yearBuilt: Number.parseInt(feature.properties.YearBuilt1) || 0,
                effectiveYear: Number.parseInt(feature.properties.EffectiveY) || 0,
                deeds,
                cases
            }
            await seed(property)
        }
    })
}
scrape("resources/LACounty_Parcels_Shapefile/LACounty_Parcels_5.shp")