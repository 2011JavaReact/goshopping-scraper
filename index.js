/*
  scrapes the amazon best sellers url for categories. each category has
  a page for its best sellers. that page is scraped and then for each
  item in it, the page for that item is scraped for more item info like
  description. the scraped data is outputted into a json file.

  The progress of this process is tracked so it will continue where it
  left off if you cancel it. data is synced to disk at 1 minute
  intervals. note that images are also stored on disk if you want to
  host them yourself. also note all the data that is scraped, including
  images will be output into ./data/

  This code isnt clean because I threw it together quickly, but it does
  the job of collecting the data we need. because of time constraints,
  i didnt care to figure out how to get around amazon's rate limiting, so there
  are a lot of failures you will get due to amazon rate limiting you.
  maybe 50% of requests will fail for you. For me that was ok, because
  i was ok with brute forcing 1500 items over ~6 hours.

  usage:

  node ./index.js
 */

const axios = require('axios');
const fs = require('fs');
const fse = require('fs-extra');
const sh = require('shorthash');
const sanitize = require('sanitize-filename');
const { JSDOM } = require('jsdom');
const path = require('path');
const dataDir = path.join(__dirname, 'data');
const itemsDir = path.join(dataDir, 'items');
const imagesDir = path.join(dataDir, 'images');
const progressFile = path.join(dataDir, '_progress.json');
const bestSellersFile = path.join(dataDir, '_bestsellers.html');
const bestSellersUrl = 'https://www.amazon.com/gp/bestsellers/?ref_=nav_cs_bestsellers';

async function main() {
  fse.ensureDirSync(dataDir);
  fse.ensureDirSync(itemsDir);
  fse.ensureDirSync(imagesDir);

  const progress = getProgress();
  let lastProgressSave = 0;

  try {
    const cats = await getCategories();

    for (let catCnt = 0; catCnt < cats.length; catCnt++) {
      const cat = cats[catCnt];
      const items = await getCategoryItems(cat);

      for (let cnt = 0; cnt < items.length; cnt++) {
        const i = items[cnt];
        const now = Date.now();

        if (progress[i.name]) {
          continue;
        }

        console.log(`[${new Date()}] [cat=${catCnt}/${cats.length}] ` +
            `[item=${cnt}/${items.length}] ${i.name}`);

        try {
          const augmentedItem = await augmentItem(i);

          if (augmentedItem) {
            progress[i.name] = augmentedItem;
            await new Promise(res => setTimeout(res, 1000));
          }
        } catch (e) {
          console.log(`[${new Date()}] failed scrape`);
          cnt--;
          await new Promise(res => setTimeout(res, 5000));
        }

        if ((now - lastProgressSave) > 60000) {
          saveProgress(progress);
          lastProgressSave = now;
        }
      }
    }

  } catch (e) {
    console.log(e.message);
  }

  saveProgress(progress);
}

function getProgress() {
  return fs.existsSync(progressFile) ?
      JSON.parse(fs.readFileSync(progressFile).toString()) : {};
}

function saveProgress(progress) {
  console.log(`[${new Date()}] saving progress`);
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
}

/** returns contents of fileName if exists else write to filename the page
 * at the given url and then returns the html*/
async function getHtml(fileName, url) {
  if (fs.existsSync(fileName)) {
    return fs.readFileSync(fileName).toString();
  } else {
    const html = (await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36',
      },
    })).data;
    await fs.writeFileSync(fileName, html);
    return html;
  }
}

async function getCategories() {
  const html = await getHtml(bestSellersFile, bestSellersUrl);
  const dom = new JSDOM(html);
  const anchors = dom.window.document.querySelectorAll(
      '#zg_browseRoot>ul>li>a');
  const categories = [];

  for (const a of anchors) {
    categories.push({
      url: a.getAttribute('href'),
      name: sanitize(a.innerHTML.replace(new RegExp('&amp;', 'g'), 'and')),
    });
  }

  return categories;
}

async function getCategoryItems(cat) {
  const categoryBestSellersFile = path.join(dataDir, cat.name + '.html');
  const html = await getHtml(categoryBestSellersFile, cat.url);
  const dom = new JSDOM(html);
  const itemElts = dom.window.document.querySelectorAll('.zg-item');
  const items = [];

  for (const elt of itemElts) {
    try {
      const relUrl = elt.querySelector('a').href;
      const rawPrice = elt.querySelector('.p13n-sc-price').innerHTML.trim();
      const price = Number(rawPrice.replace('$', ''));
      const rawName = elt.firstElementChild.lastElementChild.innerHTML.trim();
      const name = rawName.replace(new RegExp('&amp;', 'g'), 'and');
      const i = {
        url: `https://www.amazon.com${relUrl}`,
        name,
        imgurl: elt.querySelector('img').src,
        price,
        tags: [cat.name],
      };
      items.push(i);
    } catch (e) {
    }
  }

  return items;
}

/**
 * appends description to given item and downloads the image locally.
 * if it cant download an image, undefined is returned
 */
async function augmentItem(baseItem) {
  const hash = sh.unique(baseItem.name);
  const fname = path.join(itemsDir, hash + '.html');
  const html = await getHtml(fname, baseItem.url);
  const dom = new JSDOM(html);
  const bullets = dom.window.document.getElementById('feature-bullets');

  if (bullets) {
    const featElts = bullets.querySelectorAll('.a-list-item');
    const feats = [];

    for (const feat of featElts) {
      feats.push(feat.innerHTML.trim());
    }

    baseItem.description = feats.join(' ');
  }

  baseItem.img = await downloadImage(baseItem.imgurl, hash);
  return baseItem.img ? baseItem : undefined;
}

/**
 * downloads image at given url and saves it in a file with the given name.
 * returns filename + ext iff an image was downloaded
 */
async function downloadImage(url, destNameNoExt) {
  const jpgFile = path.join(imagesDir, destNameNoExt + '.jpg');
  const pngFile = path.join(imagesDir, destNameNoExt + '.png');

  if (fs.existsSync(jpgFile)) {
    return path.basename(jpgFile);
  } else if (fs.existsSync(pngFile)) {
    return path.basename(pngFile);
  }

  const res = await axios({
    url,
    responseType: 'stream',
  });
  const ctype = res.headers['content-type'];
  const destFile = ctype === 'image/jpeg' ? jpgFile :
      ctype === 'image/png' ? pngFile : undefined;

  if (!destFile) {
    return;
  }

  try {
    await new Promise((resolve, rej) => {
      res.data.pipe(fs.createWriteStream(destFile))
          .on('finish', resolve)
          .on('error', rej);
    });
    return path.basename(destFile);
  } catch (e) {
  }
}

main();
