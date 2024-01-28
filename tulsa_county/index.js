const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
require("dotenv").config();
const { waitForDownload } = require("puppeteer-utilz");

const stealth = StealthPlugin();
puppeteer.use(StealthPlugin());
stealth.enabledEvasions.delete("iframe.contentWindow");

const oneDayInMs = 24 * 60 * 60 * 1000;

const email = process.env.EMAIL;
const password = process.env.PASSWORD;

const startDate = '01/01/2020';
const endDate = '01/10/2020';

async function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        args: ["--start-maximized"],
        timeout: 6000000,
        protocolTimeout: 6000000,
        defaultViewport: null,
    });
    const page = await browser.newPage();
    await page.goto('https://acclaim.tulsacounty.org/AcclaimWeb/Account/Login');

    await page.waitForSelector('input[name="Username"]')
    await page.type('#Username', email);
    await page.type('#Password', password);

    await page.click('input[value="Log in"]');
    await page.goto('https://acclaim.tulsacounty.org/AcclaimWeb/Search/SearchTypeDocType');

    await page.waitForSelector('input[name="DateFrom"]');
    await page.click('input[name="DateFrom"]', { clickCount: 3 })
    await page.keyboard.press('Backspace')
    await page.type('input[name="DateFrom"]', startDate);
    await page.click('input[name="DateTo"]', { clickCount: 3 })
    await page.keyboard.press('Backspace')
    await page.type('input[name="DateTo"]', endDate);
    await page.click('input[name="DateFrom"]', { clickCount: 3 })
    await page.waitForSelector('#SearchBtn');
    await page.click('#SearchBtn');

    // await page.waitForSelector('tbody');
    await delay(5000);
    console.log("====")
    let pageInfo = await page.$eval('.k-pager-info.k-label', elements => elements.innerText);
    console.log(pageInfo)
    let totalItems = pageInfo.split('of')[1].split('items')[0].trim();
    totalItems = parseInt(totalItems);
    console.log(totalItems);

    let rows = await page.$$('tbody > tr');
    let i = 48
    const firstRowTexts = await page.$$eval(`tbody tr:nth-of-type(${i + 1}) td`, tds =>
        tds.map(td => td.innerText.trim())
    );
    console.log(firstRowTexts);

    const newTabPromise = new Promise((resolve) => browser.once('targetcreated', resolve));
    await rows[i].click();

    // opens new page
    const newTarget = await newTabPromise;
    const newTab = await newTarget.page(); // Dereference the new target as a Page object.

    // Wait for the selector in the context of the new tab.
    if (newTab) {
        await newTab.waitForSelector('#DocumentdetailsDiv > div');
        const innerTexts = await newTab.evaluate(() => {
            const divs = Array.from(document.querySelectorAll('#DocumentdetailsDiv > div')); // Select all divs directly under the DocumentdetailsDiv div
            // Use a map to get innerText of the 3rd, 6th, and 7th divs
            return [2, 5, 6].map(index => divs[index]?.innerText.split("\n")[1]);
        });
        console.log(innerTexts)

        await newTab.waitForSelector('#undefined_wdv1_toolbar_Button_Save');
        const newNewTabPromise = new Promise((resolve) => browser.once('targetcreated', resolve));
        await newTab.click('#undefined_wdv1_toolbar_Button_Save')

        // Open new tab again
        const newNewTarget = await newNewTabPromise;
        const newNewTab = await newNewTarget.page();

        if (newNewTab) {
            let pdfUrl = newNewTab.url();

            // Download PDF
            await newNewTab._client().send("Page.setDownloadBehavior", {
                behavior: "allow",
                downloadPath: "G:\\tulsa_county\\_output",
            });

            let pdfID = 'xxsx';

            await newNewTab.evaluate(
                (link, downloadedFileName) => {
                    const a = document.createElement("a");
                    a.href = link;
                    a.download = downloadedFileName;
                    a.style.display = "none";
                    document.body.appendChild(a);
                    a.click();
                    console.log(link, "successfully downloaded!");
                },
                pdfUrl,
                `tulsas_${pdfID}.pdf`
            );
            await waitForDownload("G:\\tulsa_county\\_output");

            await newNewTab.close()
        }
        await newTab.close();

    }


})();