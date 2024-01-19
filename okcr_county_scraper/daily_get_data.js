const puppeteer = require("puppeteer");
const fs = require("fs");
const parse = require("csv-parse");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

// essential variables for dates
const oneDayInMs = 24 * 60 * 60 * 1000;

const formatDate = (date) => {
  const d = new Date(date);

  let month = "" + (d.getMonth() + 1);
  let day = "" + d.getDate();
  let year = d.getFullYear().toString();

  if (month.length < 2) {
    month = "0" + month;
  }
  if (day.length < 2) {
    day = "0" + day;
  }

  return [year, month, day].join("-");
};

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// start date and end date
let today = new Date();
let start_date = new Date();

start_date.setTime(today.getTime() - 6 * oneDayInMs);

// Function to parse CSV and return URLs
function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    let urls = [];
    fs.createReadStream(filePath)
      .pipe(parse())
      .on("data", (row) => {
        urls.push(row[0]); // Assuming URLs are in the first column of the CSV
      })
      .on("end", () => {
        resolve(urls);
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

// Function to create new folder
async function createFolder(folderPath) {
  fs.mkdir(folderPath, { recursive: true }, (err) => {
    if (err) {
      console.error("Error creating folder:", err);
    } else {
      console.log("Folder created:", folderPath);
    }
  });
}

// Function to write record to CSV
async function writeRecordToCsv(record, outputPath) {
  const csvWriter = createCsvWriter({
    path: outputPath,
    header: Object.keys(record).map((key) => ({ id: key, title: key })),
    append: true,
  });

  if (!fs.existsSync(outputPath)) {
    await csvWriter.writeRecords([
      Object.keys(record).reduce((obj, key) => {
        obj[key] = key;
        return obj;
      }, {}),
    ]);
  }
  await csvWriter.writeRecords([record]);
  // console.log(`Successfully appended to ${outputPath}!`);
}

// Main function to process URLs and save data
async function processUrls(urls, outputFile) {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--start-maximized"],
    timeout: 6000000,
    protocolTimeout: 6000000,
    defaultViewport: null,
  });

  for (let url of urls) {
    const page = await browser.newPage();
    await delay(500);
    await page.goto(url);

    // Extract data from the page as before (omitted for brevity)
    const county_name = await page.$eval(
      "#secondary-details h3",
      (el) => el.innerText
    );
    // console.log("County Name: ", county_name);

    const instrument_type = await page.$eval("#primary-details h2", (el) => {
      return el.childNodes[0].textContent.replace(/\s+/g, " ").trim();
    });
    // console.log("Instrument_type:", instrument_type);

    const secondary_details = await page.$$eval(
      "#secondary-details table tbody tr td",
      (elements) => {
        // Extract the inner text of the elements
        const instrument = elements[0].innerText;
        const recorded_date = elements[1].innerText.trim();

        // Return the extracted details
        return {
          instrument,
          recorded_date,
        };
      }
    );
    // console.log("Details:", secondary_details);

    const detail_fee = await page.$$eval(
      "#detail-fees table tbody tr td",
      (elements) => {
        // Extract the inner text of the elements
        const instrumentDate = elements[5]?.innerText ?? "";
        const considerationAmount = elements[1]?.innerText ?? "";
        const documentStamps = elements[3]?.innerText ?? "";
        const filingFees = elements[0]?.innerText ?? "";
        const mortgageAmount = elements[2]?.innerText ?? "";

        // Return the extracted details
        return {
          instrumentDate,
          considerationAmount,
          documentStamps,
          filingFees,
          mortgageAmount,
        };
      }
    );
    // console.log(detail_fee);

    const primary_details = await page.$$eval(
      "#primary-details table tbody tr td",
      (elements) => {
        // Extract the inner text of the elements
        const bookInfo = elements[0].innerText;
        const pagesInfo = elements[1].innerText;

        // Return the extracted details
        return {
          bookInfo,
          pagesInfo,
        };
      }
    );
    // console.log(primary_details);

    const detail_people = await page.evaluate(() => {
      try {
        const lists = document.querySelectorAll(
          "#detail-people ul.people-type-list"
        );

        const grantorInfo = Array.from(lists[0].querySelectorAll("li")).map(
          (li) => li.innerText.split("Search")[1].trim() || ""
        );
        const granteeInfo = Array.from(lists[1].querySelectorAll("li")).map(
          (li) => li.innerText.split("Search")[1].trim() || ""
        );

        // Return the extracted details
        return {
          grantorInfo,
          granteeInfo,
        };
      } catch (error) {
        return { grantorInfo: [], granteeInfo: [] }; // Return an empty object with empty arrays if the elements do not exist
      }
    });
    // console.log("Detail_people:", detail_people);

    // Extract legalInfoList
    const legalInfoList = await page.evaluate(() => {
      try {
        const lis = document.querySelectorAll("#detail-legals ul li");
        return (
          Array.from(lis).map((li) => li.innerText.split("Search")[1].trim()) ||
          ""
        );
      } catch (error) {
        return []; // Return an empty array if the elements do not exist
      }
    });
    // console.log("Legal information:", legalInfoList);

    const firstLiHref = await page.$$eval("#detail-images ul li", (lis) => {
      const firstLiElement = lis[0];
      const href = firstLiElement.querySelector("a").getAttribute("href");
      return href;
    });
    // console.log("First li href:", firstLiHref);

    const record = {
      county: county_name,
      instrument_number: secondary_details.instrument,
      instrument_type: instrument_type,
      date_recorded: secondary_details.recorded_date,
      date_instrument: detail_fee.instrumentDate,
      consideration: detail_fee.considerationAmount,
      document_stamps: detail_fee.documentStamps,
      filing_fees: detail_fee.filingFees,
      mortagage_amount: detail_fee.mortgageAmount,
      page: primary_details.pagesInfo,
      book: primary_details.bookInfo,
      url: url,
      view_all_url: "https://okcountyrecords.com" + firstLiHref,
      grantor: detail_people.grantorInfo.join(", "),
      grantee: detail_people.granteeInfo.join(", "),
      legal_from_source: legalInfoList.join(", "),
    };

    await writeRecordToCsv(record, outputFile);
    await page.close();
  }

  await browser.close();
}

const csvFiles = [
  {
    input: "daily_update/Adair_urls.csv",
    output: `daily_update/${formatDate(start_date)}_${formatDate(
      today
    )}/Adair_books.csv`,
  },
  {
    input: "daily_update/Alfalfa_urls.csv",
    output: `daily_update/${formatDate(start_date)}_${formatDate(
      today
    )}/Alfalfa_books.csv`,
  },

  // ...
];

(async () => {
  console.log("Daily Scraping");
  const newFolderPath = `daily_update/${formatDate(start_date)}_${formatDate(
    today
  )}`;
  createFolder(newFolderPath);

  for (let files of csvFiles) {
    console.log(files.input);
    const urls = await parseCsv(files.input);
    await processUrls(urls, files.output);
  }
})();
