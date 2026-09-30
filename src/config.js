// SMASH NEWS — source registry, brands, categories, DuPage geography.
// Everything the collector watches lives here. Edit this file to add/remove sources.

export const APP = {
  name: 'SMASH NEWS',
  tagline: 'Everything New. Every Day.',
  timezone: 'America/Chicago',
};

export const CATEGORIES = [
  { id: 'dupage', label: 'DuPage', icon: '📍' },
  { id: 'news', label: 'US & World', icon: '🌎' },
  { id: 'tech', label: 'Tech', icon: '📱' },
  { id: 'auto', label: 'Automotive', icon: '🚗' },
  { id: 'gaming', label: 'Gaming', icon: '🎮' },
  { id: 'energy', label: 'Drinks', icon: '🥤' },
  { id: 'fitness', label: 'Fitness', icon: '🏋️' },
  { id: 'food', label: 'Food', icon: '🍔' },
  { id: 'clothing', label: 'Clothing & Shoes', icon: '👟' },
  { id: 'retail', label: 'Retail', icon: '🛍️' },
  { id: 'deals', label: 'Deals', icon: '💰' },
  { id: 'recalls', label: 'Recalls', icon: '⚠️' },
  { id: 'openings', label: 'Store Openings', icon: '🏪' },
];

// name | category | aliases (regex-safe plain strings; matched on word boundaries)
const BRAND_TABLE = `
Apple|tech|iPhone,iPad,MacBook,Apple Watch,AirPods,Vision Pro,iOS
Samsung|tech|Galaxy Z Fold,Galaxy Z Flip,Galaxy Watch,Galaxy Tab,Galaxy Buds,Galaxy S25,Galaxy S26,Galaxy S27
Google|tech|Google Pixel,Android,Google Gemini,Gemini AI
Microsoft|tech|Windows 11,Surface Pro,Surface Laptop,Copilot
NVIDIA|tech|GeForce,RTX
AMD|tech|Ryzen,Radeon
Intel|tech|
Sony|tech|
Meta|tech|Meta Quest,Ray-Ban Meta,Instagram,WhatsApp
Amazon|retail|Prime Day,Amazon Alexa,Kindle
OpenAI|tech|ChatGPT
Anthropic|tech|Claude AI
Qualcomm|tech|Snapdragon
Dell|tech|Alienware
Lenovo|tech|
Garmin|tech|
DJI|tech|
GoPro|tech|
Bose|tech|
Tesla|auto|Cybertruck,Model Y,Model 3
Ford|auto|F-150,Mustang,Ford Bronco,Maverick pickup
Chevrolet|auto|Chevy,Corvette,Silverado,Camaro
GMC|auto|GMC Sierra,Hummer EV
Dodge|auto|Dodge Charger,Dodge Challenger,Dodge Durango
Ram|auto|Ram 1500,Ram 2500,Ram Trucks
Jeep|auto|Jeep Wrangler,Grand Cherokee
Toyota|auto|Toyota Tacoma,Camry,RAV4,4Runner,Toyota Tundra
Honda|auto|Honda Civic,Honda Accord,CR-V
Nissan|auto|
Hyundai|auto|
Kia|auto|
Subaru|auto|
BMW|auto|
Mercedes-Benz|auto|Mercedes-AMG
Porsche|auto|
Rivian|auto|
Nintendo|gaming|Switch 2,Nintendo Switch,Super Mario,Zelda,Pokémon,Pokemon
PlayStation|gaming|PS5,PS Plus,PlayStation 5
Xbox|gaming|Game Pass
Steam|gaming|Steam Deck,Valve Corp
Fortnite|gaming|
Call of Duty|gaming|
GTA|gaming|GTA 6,GTA VI,Grand Theft Auto,Rockstar Games
EA Sports|gaming|Madden NFL,EA FC,EA Sports FC
Minecraft|gaming|
Monster|energy|Monster Energy,Monster Ultra
Red Bull|energy|
Celsius|energy|
GHOST|energy|Ghost Energy,Ghost Lifestyle
C4|energy|C4 Energy
Alani Nu|energy|
PRIME|energy|Prime Hydration,Prime Energy
Bang|energy|Bang Energy
Reign|energy|Reign Energy
3D Energy|energy|
Ryse|fitness|
Bucked Up|fitness|
Gorilla Mind|fitness|
Optimum Nutrition|fitness|
Gymshark|clothing|
Nike|clothing|Air Jordan,Jordan Brand,Air Max
adidas|clothing|Adidas,Yeezy,adidas Samba
HOKA|clothing|
New Balance|clothing|
On Running|clothing|On Cloud
ASICS|clothing|
Under Armour|clothing|
Lululemon|clothing|
7 Brew|food|7Brew,Seven Brew
Scooter's Coffee|food|Scooters Coffee
Starbucks|food|
Dunkin'|food|Dunkin
Dutch Bros|food|
McDonald's|food|McDonalds,Big Mac,McFlurry
Chick-fil-A|food|Chick fil A
Taco Bell|food|
Wendy's|food|
Burger King|food|Whopper
Raising Cane's|food|Raising Canes
Chipotle|food|
Popeyes|food|
Portillo's|food|Portillos
Walmart|retail|
Target|retail|
Costco|retail|
Best Buy|retail|
Home Depot|retail|
Lowe's|retail|
GameStop|retail|
Trader Joe's|retail|
Aldi|retail|
Liquid I.V.|energy|Liquid IV,LiquidIV
5-hour Energy|energy|5 Hour Energy
NOS Energy|energy|NOS energy drink
Full Throttle|energy|Full Throttle energy
Venom Energy|energy|
Arizona|energy|AriZona,Arizona Iced Tea,Arizona Beverages
Jocko Fuel|energy|Jocko
Rockstar|energy|
KFC|food|Kentucky Fried Chicken
Gorilla Mode|fitness|
Redcon1|fitness|
Cellucor|fitness|
MuscleTech|fitness|
Dymatize|fitness|
Kaged|fitness|
Transparent Labs|fitness|
Legion Athletics|fitness|
JYM|fitness|JYM Supplement
Reebok|clothing|
xAI|tech|Grok
HP|tech|Hewlett-Packard,HP Inc
ASUS|tech|ROG Ally
Acer|tech|Predator Helios
Logitech|tech|
Beats|tech|Beats by Dre,Powerbeats,Beats Studio,Beats Solo
Chrysler|auto|Pacifica
Mazda|auto|Miata,MX-5
Volkswagen|auto|VW
Audi|auto|
Lucid|auto|Lucid Motors,Lucid Air,Lucid Gravity
Epic Games|gaming|Epic Games Store
EA|gaming|Electronic Arts
Activision|gaming|
Ubisoft|gaming|Assassin's Creed
Bethesda|gaming|Elder Scrolls,Fallout
Unreal Engine|gaming|
Sam's Club|retail|Sams Club
Dick's Sporting Goods|retail|Dicks Sporting Goods
AutoZone|retail|
O'Reilly Auto Parts|retail|O'Reilly Auto
Advance Auto Parts|retail|
GM|auto|General Motors
Cadillac|auto|Escalade,Lyriq
Buick|auto|
Lincoln|auto|Lincoln Navigator
Land Rover|auto|Range Rover,Defender
Lexus|auto|
`;

// Brands whose names are also everyday words need topical context nearby to count.
export const BRAND_CONTEXT = {
  monster: /energy|drink|beverage|flavor|can\b|Monster Beverage/i,
  celsius: /energy|drink|beverage|flavor|Celsius Holdings|can\b/i,
  ghost: /energy|drink|protein|supplement|flavor|pre-?workout|Ghost Lifestyle/i,
  c4: /energy|drink|pre-?workout|supplement|Cellucor|flavor/i,
  prime: /hydration|energy drink|Logan Paul|KSI|drink/i,
  bang: /energy|drink|Bang Energy|beverage/i,
  reign: /energy|drink|beverage/i,
  hp: /laptop|printer|PC|computer|Chromebook|OmniBook|Pavilion|Spectre|EliteBook|HP Inc|Hewlett/i,
  beats: /headphone|earbud|Beats by|Powerbeats|Studio|Solo|Pill|speaker|Apple/i,
  lucid: /Motors|Air|Gravity|EV|electric|sedan|SUV/i,
  arizona: /tea|drink|beverage|can|AriZona|99|flavor/i,
  ea: /game|Sports|FC|Madden|Battlefield|Apex|Sims|studio/i,
  rockstar: /energy|drink|flavor|Rockstar Energy/i,
  lincoln: /Navigator|Aviator|Nautilus|Corsair|Ford|vehicle|SUV|recall|dealer|Motor/i,
  gm: /General Motors|vehicle|truck|recall|Chevrolet|Cadillac|GMC|Buick|EV|Barra|plant|UAW/i,
  ryse: /supplement|pre-?workout|protein|energy|flavor/i,
  ram: /truck|pickup|Stellantis|1500|2500|HD\b|dealer|recall/i,
  target: /store|retail|shopper|Target Corp|Target's|at Target|Target Circle|retailer/i,
  dodge: /Charger|Challenger|Durango|Hornet|Stellantis|Hemi|muscle car|recall|vehicle|SRT/i,
  ford: /vehicle|truck|car|EV|F-150|Mustang|Bronco|recall|Ford Motor|dealer|Explorer/i,
  apple: /iPhone|iPad|Mac|iOS|Apple Watch|Cupertino|App Store|Apple Inc|Tim Cook|AirPods|Vision Pro|Apple TV|Apple Music|Apple Intelligence/i,
  steam: /game|Valve|PC|Steam Deck|sale/i,
  meta: /Facebook|Instagram|WhatsApp|Zuckerberg|Quest|Meta AI|Meta Platforms|Threads/i,
  sony: /PlayStation|camera|TV|headphone|Xperia|WH-|Bravia|Sony Pictures|Sony Group/i,
  legion: /supplement|protein/i,
};
const BRAND_NEGATIVE = {
  ford: /\b(Harrison|Doug|Tom|Gerald|Betty|Christine Blasey) Ford\b|Ford Foundation|Ford's Theatre|Henry Ford (Hospital|Health)/,
  apple: /Big Apple|apple pie|Apple Hill/,
  honda: /Honda Center|Honda Classic|Honda Battle|American Honda Motor Ice/,
};
export { BRAND_NEGATIVE };

export const BRANDS = BRAND_TABLE.trim().split('\n').map((line) => {
  const [name, category, aliases] = line.split('|');
  return {
    id: slug(name),
    name,
    category,
    aliases: (aliases || '').split(',').map((s) => s.trim()).filter(Boolean),
  };
});

export function slug(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------------- DuPage geography ----------------
// core: municipality lies entirely or mostly inside DuPage County.
// border: only a small part lies in DuPage — never auto-verified from the name alone.
// unique: name is distinctive enough nationally that an Illinois-context check is not required.
export const DUPAGE_PLACES = [
  // name, tier, unique, patchSlug
  ['Addison', 'core', false, 'addison'],
  ['Bensenville', 'core', true, 'bensenville'],
  ['Bloomingdale', 'core', false, 'bloomingdale'],
  ['Burr Ridge', 'core', true, 'burrridge'],
  ['Carol Stream', 'core', true, 'carolstream'],
  ['Clarendon Hills', 'core', true, 'clarendonhills'],
  ['Darien', 'core', false, 'darien'],
  ['Downers Grove', 'core', true, 'downersgrove'],
  ['Elmhurst', 'core', false, 'elmhurst'],
  ['Glen Ellyn', 'core', true, 'glenellyn'],
  ['Glendale Heights', 'core', true, 'glendaleheights'],
  ['Hinsdale', 'core', false, 'hinsdale'],
  ['Itasca', 'core', false, 'itasca'],
  ['Lisle', 'core', false, 'lisle'],
  ['Lombard', 'core', false, 'lombard'],
  ['Medinah', 'core', true, null],
  ['Naperville', 'core', true, 'naperville'],
  ['Oak Brook', 'core', true, 'oakbrook'],
  ['Oakbrook Terrace', 'core', true, null],
  ['Roselle', 'core', false, 'roselle'],
  ['Villa Park', 'core', false, 'villapark'],
  ['Warrenville', 'core', false, 'warrenville'],
  ['Wayne', 'core', false, null],
  ['West Chicago', 'core', true, 'westchicago'],
  ['Westmont', 'core', false, 'westmont'],
  ['Wheaton', 'core', false, 'wheaton'],
  ['Willowbrook', 'core', false, null],
  ['Winfield', 'core', false, 'winfield'],
  ['Wood Dale', 'core', true, 'wooddale'],
  ['Woodridge', 'core', false, 'woodridge'],
  ['Aurora', 'border', false, 'aurora'],
  ['Bartlett', 'border', false, 'bartlett'],
  ['Bolingbrook', 'border', true, 'bolingbrook'],
  ['Hanover Park', 'border', true, 'hanoverpark'],
  ['Elk Grove Village', 'border', true, null],
  ['Schaumburg', 'border', true, null],
  ['St. Charles', 'border', false, null],
  ['Lemont', 'border', false, null],
].map(([name, tier, unique, patch]) => ({ name, tier, unique, patch }));

// Landmarks that are unambiguously inside DuPage County.
export const DUPAGE_LANDMARKS = [
  ['Oakbrook Center', 'Oak Brook'], ['Yorktown Center', 'Lombard'], ['Cantigny', 'Wheaton'],
  ['Morton Arboretum', 'Lisle'], ['College of DuPage', 'Glen Ellyn'], ['Wheaton College', 'Wheaton'],
  ['Elmhurst University', 'Elmhurst'], ['North Central College', 'Naperville'], ['Benedictine University', 'Lisle'],
  ['Edward Hospital', 'Naperville'], ['Central DuPage Hospital', 'Winfield'], ['Good Samaritan Hospital', 'Downers Grove'],
  ['Elmhurst Hospital', 'Elmhurst'], ['DuPage Airport', 'West Chicago'], ['Stratford Square', 'Bloomingdale'],
  ['Naperville Riverwalk', 'Naperville'], ['Drury Lane Oakbrook', 'Oakbrook Terrace'], ['Fermilab', 'Batavia/Warrenville'],
];

export const DUPAGE_ROADS = [
  'I-88', 'I-355', 'I-290', 'IL-390', 'IL-38', 'IL-53', 'IL-59', 'IL-56', 'IL-64', 'IL-83', 'IL-19', 'IL-20', 'US-20',
  'Reagan Tollway', 'Veterans Memorial Tollway', 'Elgin-O\'Hare', 'Eisenhower Expressway', 'Roosevelt Road',
  'North Avenue', 'Butterfield Road', 'Ogden Avenue', 'Route 59', 'Route 53', 'Route 38', 'Route 56', 'Route 64', 'Route 83',
  'Lake Street', 'Army Trail Road', 'Naperville Road', 'Washington Street', 'Main Street', 'Finley Road', 'Winfield Road',
];

// Chicago-area outlets whose coverage is implicitly Illinois (satisfies the "Illinois context" check).
export const CHICAGO_OUTLETS = [
  'dailyherald.com', 'patch.com/illinois', 'chicagotribune.com', 'suntimes.com', 'nbcchicago.com', 'abc7chicago.com',
  'cbsnews.com/chicago', 'wgntv.com', 'fox32chicago.com', 'wbez.org', 'wttw.com', 'napervillesun', 'mysuburbanlife.com',
  'shawlocal.com', 'positivelynaperville.com', 'chicagotribune', 'Daily Herald', 'Chicago Tribune', 'Chicago Sun-Times',
  'NBC Chicago', 'ABC7 Chicago', 'ABC 7 Chicago', 'CBS Chicago', 'WGN', 'FOX 32', 'Fox 32 Chicago', 'WBEZ', 'WTTW',
  'Naperville Sun', 'Shaw Local', 'Patch',
];

// ---------------- Source registry ----------------
// type: rss | nws | bing | google
// tier: fast (every ~5 min) | normal (~20 min) | slow (~60 min)
// official: first-party publisher/agency (higher trust). Discovery providers are never official.
const officialFeeds = [
  // Brands (first-party newsrooms)
  ['apple-newsroom', 'Apple Newsroom', 'https://www.apple.com/newsroom/rss-feed.rss', 'tech', 'normal'],
  ['nvidia-news', 'NVIDIA Newsroom', 'https://nvidianews.nvidia.com/releases.xml', 'tech', 'normal'],
  ['google-keyword', 'Google — The Keyword', 'https://blog.google/rss/', 'tech', 'normal'],
  ['microsoft-source', 'Microsoft Source', 'https://news.microsoft.com/source/feed/', 'tech', 'normal'],
  ['playstation-blog', 'PlayStation Blog', 'https://blog.playstation.com/feed/', 'gaming', 'normal'],
  ['xbox-wire', 'Xbox Wire', 'https://news.xbox.com/en-us/feed/', 'gaming', 'normal'],
  // Government recalls / safety
  ['cpsc-recalls', 'CPSC Recalls', 'https://www.cpsc.gov/Newsroom/CPSC-RSS-Feed/Recalls-RSS', 'recalls', 'normal'],
  ['fda-recalls', 'FDA Food Safety Recalls', 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/food-safety-recalls/rss.xml', 'recalls', 'normal'],
];

const publisherFeeds = [
  ['npr-news', 'NPR News', 'https://feeds.npr.org/1001/rss.xml', 'news', 'fast'],
  ['bbc-world', 'BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'news', 'fast'],
  ['bbc-us', 'BBC US & Canada', 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', 'news', 'fast'],
  ['verge', 'The Verge', 'https://www.theverge.com/rss/index.xml', 'tech', 'normal'],
  ['engadget', 'Engadget', 'https://www.engadget.com/rss.xml', 'tech', 'normal'],
  ['9to5mac', '9to5Mac', 'https://9to5mac.com/feed/', 'tech', 'normal'],
  ['electrek', 'Electrek', 'https://electrek.co/feed/', 'auto', 'normal'],
  ['motor1', 'Motor1', 'https://www.motor1.com/rss/news/all/', 'auto', 'normal'],
  ['ign', 'IGN', 'https://feeds.feedburner.com/ign/all', 'gaming', 'normal'],
  ['bevnet', 'BevNET', 'https://www.bevnet.com/feed', 'energy', 'slow'],
  ['slickdeals', 'Slickdeals Frontpage', 'https://feeds.feedburner.com/SlickdealsnetFP', 'deals', 'normal'],
];

// Discovery searches — run on BOTH Bing News and Google News. Results are verified/classified locally.
const discovery = [
  // DuPage incidents (fast)
  ['dupage-county', 'dupage', 'fast', '"DuPage County" crash OR fire OR police OR closure OR outage OR flooding OR emergency'],
  ['dupage-towns-1', 'dupage', 'fast', 'Naperville OR Wheaton OR "Downers Grove" OR "Glen Ellyn" OR Lombard crash OR fire OR police OR closed OR outage'],
  ['dupage-towns-2', 'dupage', 'fast', 'Elmhurst OR Addison OR "Villa Park" OR Bensenville OR "Wood Dale" OR Itasca Illinois crash OR fire OR police OR closure'],
  ['dupage-towns-3', 'dupage', 'fast', '"Carol Stream" OR "Glendale Heights" OR Bloomingdale OR Roselle OR "West Chicago" OR Winfield Illinois crash OR fire OR police'],
  ['dupage-towns-4', 'dupage', 'fast', 'Lisle OR Woodridge OR Darien OR Westmont OR Hinsdale OR "Oak Brook" OR Warrenville Illinois crash OR fire OR police'],
  ['dupage-roads', 'dupage', 'fast', 'I-88 OR I-355 OR I-290 OR "Route 59" OR "Route 53" OR "Route 38" OR "IL-390" crash OR closure DuPage'],
  ['dupage-metra', 'dupage', 'fast', 'Metra BNSF OR "Union Pacific West" OR "Milwaukee District West" delay OR crash OR stopped DuPage'],
  ['dupage-weather', 'dupage', 'fast', 'DuPage County flooding OR "power outage" OR ComEd OR storm OR tornado'],
  ['dupage-openings', 'dupage', 'normal', 'Naperville OR Wheaton OR Lombard OR "Downers Grove" OR "Oak Brook" OR Elmhurst "grand opening" OR "now open" OR "opening soon"'],
  ['dupage-construction', 'dupage', 'normal', 'DuPage County construction OR "lane closure" OR "road work" OR IDOT'],
  // US / world
  ['breaking-us', 'news', 'fast', 'breaking news United States'],
  ['breaking-world', 'news', 'fast', 'world news breaking'],
  // Categories
  ['energy-launch', 'energy', 'normal', 'energy drink new flavor OR launch OR limited edition'],
  ['energy-brands', 'energy', 'normal', 'Monster OR "Red Bull" OR Celsius OR "GHOST Energy" OR "C4 Energy" OR "Alani Nu" new flavor'],
  ['fitness-supps', 'fitness', 'normal', 'protein OR "pre-workout" OR creatine OR supplement new launch OR recall'],
  ['fitness-brands', 'fitness', 'slow', 'Gymshark OR "Optimum Nutrition" OR "Bucked Up" OR Ryse OR "Gorilla Mind" new'],
  ['tech-launch', 'tech', 'normal', 'Apple OR Samsung OR Google OR Microsoft new product announced OR launch'],
  ['tech-chips', 'tech', 'normal', 'NVIDIA OR AMD OR Intel OR Qualcomm new GPU OR chip OR launch'],
  ['tech-ai', 'tech', 'normal', 'OpenAI OR Anthropic OR Gemini OR Meta AI launch OR release'],
  ['auto-new', 'auto', 'normal', 'Ford OR Chevrolet OR Toyota OR Tesla OR Dodge new model OR reveal OR launch'],
  ['auto-recall', 'recalls', 'normal', 'NHTSA recall vehicles'],
  ['gaming-news', 'gaming', 'normal', 'Nintendo OR PlayStation OR Xbox OR Steam announced OR release OR update'],
  ['food-menu', 'food', 'normal', '"new menu item" OR "limited time" McDonald\'s OR Starbucks OR "Chick-fil-A" OR "Taco Bell" OR Wendy\'s'],
  ['coffee-chains', 'food', 'slow', '"7 Brew" OR "Scooter\'s Coffee" OR "Dutch Bros" OR Dunkin new OR opening OR menu'],
  ['clothing-drops', 'clothing', 'normal', 'Nike OR adidas OR HOKA OR "New Balance" OR ASICS new shoe release OR drop'],
  ['retail-news', 'retail', 'normal', 'Walmart OR Target OR Costco OR "Best Buy" announces OR new OR launches'],
  ['deals', 'deals', 'normal', 'deal OR sale OR "price drop" Apple OR Samsung OR Nike OR PlayStation OR Xbox'],
  ['recalls-food', 'recalls', 'normal', 'recall food OR drink OR supplement OR product FDA OR CPSC'],
  ['openings', 'openings', 'slow', '"grand opening" OR "new store" Costco OR Target OR Walmart OR "7 Brew" OR "Chick-fil-A" Illinois'],
  ['drinks-brands-2', 'energy', 'slow', '"Liquid I.V." OR "5-hour Energy" OR "Venom Energy" OR "Full Throttle" OR "Jocko Fuel" OR AriZona new flavor OR launch'],
  ['drinks-brands-3', 'energy', 'slow', 'PRIME OR "Bucked Up" OR "3D Energy" OR Reign OR Bang OR Rockstar energy drink new'],
  ['fitness-brands-2', 'fitness', 'slow', 'Redcon1 OR MuscleTech OR Dymatize OR Kaged OR "Transparent Labs" OR "Gorilla Mode" OR JYM new OR launch OR flavor'],
  ['tech-brands-2', 'tech', 'slow', 'Dell OR HP OR Lenovo OR ASUS OR Acer OR Logitech OR Bose OR Beats OR Garmin OR GoPro OR DJI new OR launch OR announces'],
  ['tech-rumors', 'tech', 'normal', 'iPhone OR Galaxy OR Pixel OR PlayStation OR Switch leak OR rumor'],
  ['auto-brands-2', 'auto', 'slow', 'Honda OR Nissan OR Subaru OR Mazda OR Hyundai OR Kia OR Volkswagen OR BMW OR Audi OR Porsche OR Rivian OR Lucid new OR reveal'],
  ['auto-muscle', 'auto', 'slow', 'Mustang OR Camaro OR Charger OR Challenger OR Corvette new OR engine OR reveal'],
  ['gaming-publishers', 'gaming', 'slow', '"Epic Games" OR "Rockstar Games" OR EA OR Activision OR Ubisoft OR Bethesda OR Valve announces OR release'],
  ['gaming-franchises', 'gaming', 'normal', '"Call of Duty" OR GTA OR Fortnite OR Minecraft OR Pokémon new OR update OR release'],
  ['retail-auto', 'retail', 'slow', '"Sam\'s Club" OR "Dick\'s Sporting Goods" OR GameStop OR AutoZone OR "O\'Reilly Auto Parts" OR "Advance Auto Parts" OR "Home Depot" OR "Lowe\'s" news'],
  ['food-discontinued', 'food', 'slow', 'discontinued OR "limited time" OR "returning" McDonald\'s OR KFC OR Popeyes OR Chipotle OR "Raising Cane\'s" OR "Burger King"'],
  ['dupage-schools-events', 'dupage', 'normal', 'DuPage OR Naperville OR Wheaton OR Elmhurst OR Lombard school closed OR "missing" OR "downed trees" OR festival'],
  ['dupage-development', 'dupage', 'slow', 'Naperville OR Wheaton OR "Downers Grove" OR "Oak Brook" OR Lombard OR Elmhurst development OR redevelopment OR "new business" OR closing'],
];

const patchTowns = ['naperville', 'wheaton', 'glenellyn', 'downersgrove', 'lombard', 'elmhurst', 'hinsdale', 'darien', 'woodridge', 'lisle', 'westmont', 'bolingbrook'];

export function buildSources() {
  const out = [];
  for (const [id, name, url, category, tier] of officialFeeds) out.push({ id, name, url, category, tier, type: 'rss', official: true, reliability: 5 });
  for (const [id, name, url, category, tier] of publisherFeeds) out.push({ id, name, url, category, tier, type: 'rss', official: false, reliability: 4 });
  for (const town of patchTowns) {
    const place = DUPAGE_PLACES.find((p) => p.patch === town);
    out.push({
      id: `patch-${town}`, name: `Patch — ${place ? place.name : town}`, url: `https://patch.com/feeds/aol/illinois/${town}`,
      category: 'dupage', tier: 'fast', type: 'rss', official: false, reliability: 4,
    });
  }
  // National Weather Service active alerts for DuPage County (county zone ILC043 + forecast zone ILZ013).
  out.push({ id: 'nws-dupage', name: 'National Weather Service — DuPage', url: 'https://api.weather.gov/alerts/active?zone=ILC043,ILZ013', category: 'dupage', tier: 'fast', type: 'nws', official: true, reliability: 5 });
  // Google News top stories
  out.push({ id: 'gnews-top', name: 'Google News — Top Stories', url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en', category: 'news', tier: 'fast', type: 'google', official: false, reliability: 3 });
  for (const [id, category, tier, q] of discovery) {
    out.push({ id: `bing-${id}`, name: `Bing News: ${id}`, query: q, url: bingUrl(q), category, tier, type: 'bing', official: false, reliability: 3 });
    out.push({ id: `gnews-${id}`, name: `Google News: ${id}`, query: q, url: googleUrl(q), category, tier, type: 'google', official: false, reliability: 3 });
  }
  return out;
}

export function bingUrl(q) {
  return `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=en-us&cc=US`;
}
export function googleUrl(q, window = '2d') {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${window}`)}&hl=en-US&gl=US&ceid=US:en`;
}

export const TIER_MINUTES = { fast: 5, normal: 20, slow: 60 };
