this is a simple script to scrape data from the Amazon best seller pages for its best seller categories. you will be rate limited if you try to run this script, so prepare for > 50% failure rate. The result is 1500-2000 items and took me 3-6 hours.

The scraped items are stored into `./data/_progress.json` and once you clean it, it will be placed into `./dummyitems.json`. you can then take these dummy items and POST them as bodies to `/item` in our api. if you are interested in the code that does that, you can find the json file produced here copied into [here](https://github.com/VincentJ711/goshopping-api/tree/dev/src/main/resources) and used in the same repo by a simple java application that loads the items from the json file and posts them as bodies to our api. you can find the application [here](https://github.com/VincentJ711/goshopping-api/blob/dev/src/main/java/com/revature/goshopping/utility/DbInitializer.java).

You can try scraping Amazon by doing

``` 
npm install

# will take 3-6 hours to complete
# u can stop at any point and the progress
# will be saved.
node ./index.js

# once the above is complete, clean up the data
# so it can be indexed into our api
node ./cleandata.js
```