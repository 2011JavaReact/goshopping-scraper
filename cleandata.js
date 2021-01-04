/*
  cleans up the scraped data from ./data/_progress.json
  and outputs it into ./dummyitems.json. the items in the output
  can then be indexed into the database through our api. see the readme for
  more info on that process.

  usage:

  node ./cleandata.js
 */

const fs = require('fs');
const items = require('./data/_progress.json');
const outfile = require('path').join(__dirname, 'dummyitems.json');
const out = [];

for (const k in items) {
  const o = items[k];

  if (!o.price || !o.name || !o.imgurl) {
    continue;
  }

  o.description = o.description || '';
  o.description = o.description.replace(`<span id="replacementPartsFitmentBulletInner"> <a class="a-link-normal hsx-rpp-fitment-focus" href="#">Make sure this fits</a>\n<span>by entering your model number.</span>\n</span>`, '')

  if (/<\/?[a-z][\s\S]*>/i.test(o.description)) {
    continue;
  }

  out.push({
    name: o.name.trim(),
    price: o.price,
    description: o.description.trim(),
    img: o.imgurl,
    tags: o.tags.map(t => {
      return {
        name: t
      }
    })
  });
}

fs.writeFileSync(outfile, JSON.stringify(out, null, 2));