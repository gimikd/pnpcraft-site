/**
 * Pinpanacraft email-to-store robot
 * ----------------------------------
 * Lives inside the "Pinpanacraft Store" Google Sheet (Extensions > Apps Script).
 *
 * What it does, every 5 minutes:
 *   1. Reads new emails sent to STORE_ADDRESS from an approved sender.
 *   2. Photo + short note  -> AI writes the listing, a new row is added to the sheet.
 *      Commands like "sold P013" or "price P013 18" -> the row is updated.
 *   3. Publishes the sheet to the website: products.json plus any new photos are
 *      committed to the GitHub repo in a single commit. GitHub Pages redeploys in ~1 minute.
 *   4. Replies to the sender with what changed.
 *
 * Editing the sheet by hand works too: changes are published on the next 5-minute run,
 * or right away with the menu  Pinpanacraft > Publish to website now.
 *
 * Secrets are NOT stored in this file. Add them under Project Settings > Script Properties:
 *   GITHUB_TOKEN       fine-grained token, this repo only, "Contents: Read and write"
 *   GEMINI_API_KEY     if AI_PROVIDER is "gemini"  (free key from aistudio.google.com)
 *   ANTHROPIC_API_KEY  if AI_PROVIDER is "claude"  (console.anthropic.com)
 */

var CONFIG = {
  STORE_ADDRESS: 'phinphana2+store@gmail.com',        // email photos and commands here
  ALLOWED_SENDERS: ['phinphana2@gmail.com', 'gimikd@gmail.com'], // only these can change the store
  GITHUB_REPO: 'YOUR-GITHUB-USERNAME/pnpcraft-site',   // owner/repo
  GITHUB_BRANCH: 'main',
  SITE_URL: 'https://pnpcraft.com',
  AI_PROVIDER: 'gemini',                               // "gemini" (free tier) or "claude" (paid, pennies)
  GEMINI_MODEL: 'gemini-2.5-flash',
  CLAUDE_MODEL: 'claude-haiku-4-5',
  PHOTO_FOLDER: 'Pinpanacraft photos',                 // Drive folder that keeps every listing photo
  PHOTO_WIDTH: 1000,                                   // photos are resized to this width for the site
  NOTIFY_EMAIL: 'phinphana2@gmail.com',                // where new reservations are emailed
  AUTO_HOLD: true                                      // reserved items show "On hold" on the site right away
};

var SHEET_PRODUCTS = 'Products';
var SHEET_LOG = 'Log';
var SHEET_RES = 'Reservations';
var RES_HEADERS = ['Time', 'Name', 'Contact', 'Pickup day', 'Item codes', 'Items', 'Total', 'Status', 'Note'];
var HEADERS = ['ID', 'Status', 'Name', 'Category', 'Price', 'Description', 'Tag', 'Image', 'Photo File', 'Uploaded', 'Added', 'Updated'];
var CATEGORIES = ['denim', 'bags', 'clothing', 'resin-home', 'resin-gifts', 'jewelry', 'gifts'];
var CATEGORY_HELP = "\"denim\" = Upcycled denim (bags and pouches from old jeans); \"bags\" = Embroidered bags (backpacks, clutches, coin pouches); \"clothing\" = Clothing (elephant pants and more); \"resin-home\" = Resin coasters & trays (coasters, trays, bud vases); \"resin-gifts\" = Resin gifts (keychains and pens); \"jewelry\" = Jewelry (earrings, necklaces, bracelets); \"gifts\" = Gifts & keepsakes (elephant keychains, bookmarks)";
var STATUSES = ['available', 'reserved', 'sold', 'hidden', 'draft'];

var SEED = [
  ["P001", "available", "Denim pouch, pink flower", "denim", 15, "Upcycled jeans, wrist strap, zip top.", "Upcycled", "img/pouch-pink-flower.jpg"],
  ["P002", "available", "Denim pouch, bow patch", "denim", 15, "Dark wash denim with a pink bow.", "", "img/pouch-bow.jpg"],
  ["P003", "available", "Back-pocket denim pouch", "denim", 15, "Made around the original jeans pocket.", "", "img/pouch-pocket.jpg"],
  ["P004", "available", "Denim pouch, blue flowers", "denim", 15, "Light wash with embroidered flowers.", "", "img/pouch-blue-flowers.jpg"],
  ["P005", "available", "Embroidered backpack", "bags", 45, "Bold embroidery in gold or red.", "Favorite", "img/backpack-embroidered.jpg"],
  ["P006", "available", "Embroidered clutch", "bags", 20, "Bright patterned zip clutch with pompoms.", "", "img/clutches.jpg"],
  ["P007", "available", "Patterned shoulder bag", "bags", 25, "Indigo-and-white geometric print.", "", "img/bag-hmong-print.jpg"],
  ["P008", "available", "Resin keychain", "resin-gifts", 8, "Clear resin with pressed flowers and color.", "", "img/resin-keychains.jpg"],
  ["P009", "available", "Beaded bookmark", "gifts", 8, "Metal bookmark with beads and a charm.", "", "img/bookmarks.jpg"],
  ["P010", "available", "Gemstone chip bracelet", "jewelry", 12, "Stretch bracelet in mixed stones.", "", "img/bracelets.jpg"],
  ["P011", "available", "Charm earrings", "jewelry", 12, "Silver-tone charms, many designs.", "", "img/earrings.jpg"],
  ["P012", "available", "Denim pouch, lemon patch", "denim", 15, "Mid wash denim with a lemon patch.", "", "img/pouch-lemon.jpg"],
  ["P013", "available", "Blue glitter coaster set", "resin-home", 25, "Set of coasters in blue resin with glass beads and glitter.", "Set", "img/resin-blue-coaster-set.jpg"],
  ["P014", "available", "Round pressed-flower coaster", "resin-home", 12, "Clear resin with dried flowers and a beaded rim.", "", "img/resin-round-flower-coaster.jpg"],
  ["P015", "available", "Hexagon pressed-flower coaster", "resin-home", 12, "Deep red pressed flower in clear resin, beaded edge.", "", "img/resin-hex-flower-coaster.jpg"],
  ["P016", "available", "Wavy flower tray", "resin-home", 18, "Cloud-shaped trinket tray with dried leaves and yellow beads.", "One of a kind", "img/resin-wavy-tray.jpg"],
  ["P017", "available", "Heart trinket dish", "resin-home", 12, "Clear heart dish with a pressed flower and colored beads.", "", "img/resin-heart-dish.jpg"],
  ["P018", "available", "Pink heart tray", "resin-home", 15, "Pink resin heart with baby's breath inside.", "", "img/resin-pink-heart-tray.jpg"],
  ["P019", "available", "Pink square tray", "resin-home", 15, "Pink resin tray scattered with pressed petals.", "", "img/resin-pink-square-tray.jpg"],
  ["P020", "available", "Pink hexagon tray", "resin-home", 15, "Pink resin with tiny green leaves and blue flowers.", "", "img/resin-pink-hex-tray.jpg"],
  ["P021", "available", "Pressed-flower keychain", "resin-gifts", 8, "Resin charm keychain with real flowers, on a gift card.", "", "img/resin-keychain-cards.jpg"],
  ["P022", "available", "Tree of life earrings", "jewelry", 12, "Large silver-tone tree of life drops.", "", "img/earrings-tree-of-life.jpg"],
  ["P023", "available", "Black denim shoulder bag", "denim", 30, "Black jeans turned shoulder bag, with a hand-stitched Hmong embroidery panel.", "Upcycled", "img/bag-black-denim-embroidered.jpg"],
  ["P024", "available", "Denim tote with heart patches", "denim", 28, "Mid wash denim tote with frayed heart patches and printed cotton straps.", "", "img/tote-denim-hearts.jpg"],
  ["P025", "available", "Denim tote with embroidered band", "denim", 30, "Light denim tote with a frayed top and a red cross-stitch band.", "", "img/tote-denim-embroidered.jpg"],
  ["P026", "available", "Back-pocket denim tote", "denim", 25, "Light wash tote made around a big jeans back pocket.", "", "img/tote-denim-pocket.jpg"],
  ["P027", "available", "LAOS embroidered coin pouch", "bags", 10, "Zip pouch with LAOS stitched on the front, many colors.", "", "img/pouches-laos.jpg"],
  ["P028", "available", "Elephant pants, black peacock", "clothing", 15, "Soft, loose pants with a smocked waist and peacock print. One size.", "", "img/pants-black-peacock.jpg"],
  ["P029", "available", "Elephant pants, red floral", "clothing", 15, "Deep red with an orange and gold flower print. One size.", "", "img/pants-red-floral.jpg"],
  ["P030", "available", "Elephant pants, green mandala", "clothing", 15, "Olive mandala print with a rust waistband. One size.", "", "img/pants-green-mandala.jpg"],
  ["P031", "available", "Elephant pants, red and turquoise", "clothing", 15, "Red mandala print with turquoise elephants. One size.", "", "img/pants-red-elephant.jpg"],
  ["P032", "available", "Elephant pants, blue mandala", "clothing", 15, "Teal and navy mandala print. One size.", "", "img/pants-blue-mandala.jpg"],
  ["P033", "available", "Resin bud vase", "resin-home", 22, "Colored resin frame holding a glass tube for a single stem.", "One of a kind", "img/resin-bud-vases.jpg"],
  ["P034", "available", "Gold-flake resin pen", "resin-gifts", 8, "Clear resin pen filled with gold flakes.", "", "img/resin-pens-gold.jpg"],
  ["P035", "available", "Silver-tone pendant necklace", "jewelry", 15, "Long chain with a round or triangle pendant.", "", "img/necklaces-silver.jpg"],
  ["P036", "available", "Woven friendship bracelet", "jewelry", 5, "Bright woven band with a slide tie.", "", "img/bracelets-woven.jpg"],
  ["P037", "available", "Fabric elephant keychain", "gifts", 6, "Little stuffed elephant in patterned cotton, on a key ring.", "", "img/elephant-keychains.jpg"]
];

var HELP_TEXT = [
  'HOW TO USE THE PINPANACRAFT STORE ROBOT',
  '',
  'Add a new item:',
  '  Email ONE photo to ' + CONFIG.STORE_ADDRESS + ' with a short note, for example:',
  '  "denim pouch with pink flower $15"',
  '  The robot writes the listing and posts it. You get a reply with its code, like P013.',
  '',
  'Change an item (put the command on the first line, use the item code):',
  '  sold P013              remove it from the site',
  '  hold P013              show it as On hold',
  '  available P013         put it back for sale',
  '  price P013 18          change the price',
  '  hide P013              take it off the site without marking it sold',
  '  fix P013 call it a wristlet and mention the zipper',
  '  photo P013             (attach a new photo) replace the photo',
  '',
  'Other:',
  '  list                   get a list of everything with codes',
  '  help                   get this message',
  '',
  'You can put several commands in one email, one per line.',
  'You can also just reply to any robot email with a command.',
  'Changes show on ' + CONFIG.SITE_URL + ' in about 1 to 5 minutes.'
].join('\n');

/* ------------------------------------------------------------------ */
/* Menu and setup                                                     */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Pinpanacraft')
    .addItem('Publish to website now', 'publishNow')
    .addItem('Check store email now', 'processInbox')
    .addSeparator()
    .addItem('Run first-time setup', 'setup')
    .addToUi();
}

/** Run once. Creates the tabs, adds the starting items, and turns on the 5-minute timer. */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_PRODUCTS) || ss.insertSheet(SHEET_PRODUCTS);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    var now = new Date();
    SEED.forEach(function (r) { sh.appendRow(r.concat(['', true, now, now])); });
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    var statusRule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build();
    sh.getRange(2, 2, 999, 1).setDataValidation(statusRule);
    var catRule = SpreadsheetApp.newDataValidation().requireValueInList(CATEGORIES, true).build();
    sh.getRange(2, 4, 999, 1).setDataValidation(catRule);
    sh.autoResizeColumns(1, HEADERS.length);
  }
  var log = ss.getSheetByName(SHEET_LOG) || ss.insertSheet(SHEET_LOG);
  if (log.getLastRow() === 0) { log.appendRow(['Time', 'From', 'Request', 'Result', 'Message ID']); log.setFrozenRows(1); }
  var res = ss.getSheetByName(SHEET_RES) || ss.insertSheet(SHEET_RES);
  if (res.getLastRow() === 0) { res.appendRow(RES_HEADERS); res.setFrozenRows(1); res.getRange(1, 1, 1, RES_HEADERS.length).setFontWeight('bold'); }

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processInbox') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processInbox').timeBased().everyMinutes(5).create();
  getPhotoFolder_();

  var missing = checkSettings_();
  var msg = 'Setup done. The robot checks ' + CONFIG.STORE_ADDRESS + ' every 5 minutes.';
  if (missing.length) msg += '\n\nStill missing in Script Properties: ' + missing.join(', ');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

function checkSettings_() {
  var p = PropertiesService.getScriptProperties();
  var missing = [];
  if (!p.getProperty('GITHUB_TOKEN')) missing.push('GITHUB_TOKEN');
  if (CONFIG.AI_PROVIDER === 'gemini' && !p.getProperty('GEMINI_API_KEY')) missing.push('GEMINI_API_KEY');
  if (CONFIG.AI_PROVIDER === 'claude' && !p.getProperty('ANTHROPIC_API_KEY')) missing.push('ANTHROPIC_API_KEY');
  if (/YOUR-GITHUB-USERNAME/.test(CONFIG.GITHUB_REPO)) missing.push('GITHUB_REPO (in CONFIG at the top of Code.gs)');
  return missing;
}

function publishNow() {
  var result = publish_(true);
  try { SpreadsheetApp.getUi().alert(result); } catch (e) { Logger.log(result); }
}

/* ------------------------------------------------------------------ */
/* Main loop                                                          */
/* ------------------------------------------------------------------ */

function processInbox() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var done = processedIds_();
    var threads = GmailApp.search('to:(' + CONFIG.STORE_ADDRESS + ') newer_than:7d', 0, 30);
    var messages = [];
    threads.forEach(function (t) {
      t.getMessages().forEach(function (m) {
        if (done[m.getId()]) return;
        var to = (m.getTo() + ',' + m.getCc()).toLowerCase();
        if (to.indexOf(CONFIG.STORE_ADDRESS.toLowerCase()) === -1) return;
        messages.push(m);
      });
    });
    messages.sort(function (a, b) { return a.getDate() - b.getDate(); });

    var replies = [];
    messages.forEach(function (m) {
      var from = senderEmail_(m.getFrom());
      var result;
      if (!isAllowed_(from)) {
        result = 'Ignored: sender not on the approved list.';
        log_(from, m.getSubject(), result, m.getId());
        return;
      }
      try {
        result = handleMessage_(m);
      } catch (err) {
        result = 'Sorry, something went wrong: ' + err.message + '\n\nNothing was changed. Try again, or reply "help".';
      }
      log_(from, (m.getSubject() || '') + ' | ' + firstLine_(cleanBody(m.getPlainBody())), result.split('\n')[0], m.getId());
      replies.push({ message: m, text: result });
    });

    var published = publish_(false);
    replies.forEach(function (r) {
      var text = r.text;
      if (/^Publish failed/.test(published)) text += '\n\nNOTE: the website could not be updated yet (' + published + '). The robot will retry in 5 minutes.';
      r.message.reply(text + '\n\n--\nReply to this email with a command, or "help" for the list.', { replyTo: CONFIG.STORE_ADDRESS });
    });
  } finally {
    lock.releaseLock();
  }
}

function handleMessage_(m) {
  var body = cleanBody(m.getPlainBody());
  var subject = stripReplyPrefix(m.getSubject() || '');
  var photos = m.getAttachments({ includeInlineImages: true }).filter(function (a) {
    return /^image\//i.test(a.getContentType()) && a.getSize() > 15000; // skip tiny signature logos
  });
  var cmdLine = firstLine_(body) || subject;
  var cmd = parseCommand(cmdLine);
  if (cmd.type === 'none' && firstLine_(body) && subject) {
    var alt = parseCommand(subject);
    if (alt.type !== 'none') cmd = alt;
  }

  // A photo with a note like "back pocket pouch $15" is a new item, not a command,
  // unless the note names an item code (P013).
  if (photos.length && cmd.type !== 'photo' && cmd.ref && !/\bP\s*\d{1,4}\b/i.test(cmd.ref)) cmd = { type: 'none' };

  // Several command lines in one email (e.g. "sold P005" and "sold P010"): run them all.
  var many = body.split('\n').map(function (l) { return parseCommand(l.trim()); })
    .filter(function (c) { return c.type === 'status' || c.type === 'price' || c.type === 'fix'; });
  if (!photos.length && many.length > 1) {
    return many.map(function (c) { return applyCommand_(c, []); }).join('\n\n');
  }

  if (cmd.type === 'help') return HELP_TEXT;
  if (cmd.type === 'list') return listText_();
  if (cmd.type === 'publish') return publish_(true);
  if (cmd.type !== 'none') return applyCommand_(cmd, photos);
  if (photos.length) return addItem_(photos[0], (subject + '\n' + body).trim(), photos.length);
  return "I didn't find a photo or a command in that email.\n\n" + HELP_TEXT;
}

/* ------------------------------------------------------------------ */
/* Website backend: reservations (Deploy > New deployment > Web app)  */
/* ------------------------------------------------------------------ */

/** Health check. Open the web app URL in a browser to see this. */
function doGet() {
  return json_({ ok: true, service: 'Pinpanacraft store backend' });
}

/**
 * Receives a reservation from the website.
 * Body (sent as text/plain JSON): { name, contact, pickup_day, items: ["P013", ...], website: "" }
 * "website" is a hidden honeypot field: real visitors leave it empty.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var check = validateReservation(body);
    if (!check.ok) return json_({ ok: false, error: check.error });
    if (body.website) return json_({ ok: true }); // bot: pretend success, do nothing

    lock.waitLock(10000);
    var sh = productsSheet_();
    var rows = readRows_(sh);
    var byId = {};
    rows.forEach(function (r) { byId[r.ID] = r; });
    var picked = [], unavailable = [];
    check.items.forEach(function (id) {
      var r = byId[id];
      if (r && r.Status === 'available') picked.push(r);
      else unavailable.push(r ? r.Name + ' (' + id + ')' : id);
    });
    if (!picked.length) return json_({ ok: false, error: 'Sorry, those pieces were just reserved by someone else.', unavailable: unavailable });

    var total = 0, unpriced = 0;
    picked.forEach(function (r) { if (r.Price === '' || isNaN(Number(r.Price))) unpriced++; else total += Number(r.Price); });
    var list = picked.map(function (r) { return r.ID + ' ' + r.Name + ' (' + (r.Price === '' ? 'price at booth' : '$' + r.Price) + ')'; });

    if (CONFIG.AUTO_HOLD) {
      picked.forEach(function (r) { writeRow_(sh, r._row, { Status: 'reserved', Updated: new Date() }); });
      publish_(false);
    }
    SpreadsheetApp.getActive().getSheetByName(SHEET_RES).appendRow([new Date(), check.name, check.contact, check.day,
      picked.map(function (r) { return r.ID; }).join(' '), list.join('; '), total, 'new', unavailable.length ? 'Already gone: ' + unavailable.join(', ') : '']);

    var codes = picked.map(function (r) { return r.ID; });
    MailApp.sendEmail({
      to: CONFIG.NOTIFY_EMAIL,
      replyTo: CONFIG.STORE_ADDRESS,
      subject: 'New reservation: ' + check.name + ' for ' + check.day,
      body: [
        check.name + ' reserved these for pickup on ' + check.day + ':', '',
        list.map(function (l) { return '  ' + l; }).join('\n'), '',
        'Total: $' + total + (unpriced ? ' plus ' + unpriced + ' item(s) priced at the booth' : '') + ', paying at pickup.',
        'Contact: ' + check.contact, '',
        CONFIG.AUTO_HOLD ? 'These now show "On hold" on the website.' : 'To hold them, reply: hold ' + codes[0],
        unavailable.length ? 'Already gone, not included: ' + unavailable.join(', ') : '', '',
        'After pickup, reply with one line per item:', codes.map(function (c) { return '  sold ' + c; }).join('\n'),
        'If they cancel or do not show:', codes.map(function (c) { return '  available ' + c; }).join('\n')
      ].join('\n')
    });
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(check.contact)) {
      MailApp.sendEmail({
        to: check.contact, replyTo: CONFIG.NOTIFY_EMAIL, name: 'Pinpanacraft',
        subject: 'Your Pinpanacraft reservation for ' + check.day,
        body: 'Hi ' + check.name + ',\n\nThanks! We received your reservation for pickup at the Ybor City Market on ' + check.day + ':\n\n' +
          list.map(function (l) { return '  ' + l.replace(/^P\d+ /, ''); }).join('\n') + '\n\nTotal about $' + total + ', paid at pickup. We will confirm with you before Saturday.\n\nPinpanacraft\n' + CONFIG.SITE_URL
      });
    }
    return json_({ ok: true, held: codes, unavailable: unavailable, total: total });
  } catch (err) {
    return json_({ ok: false, error: 'Something went wrong on our side. Please message us on Facebook.' });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** True for an email address or a phone number with 10 to 15 digits. */
function isPhoneOrEmail(v) {
  v = String(v || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return true;
  var digits = v.replace(/\D/g, '');
  return /^\+?[\d\s().-]{10,20}$/.test(v) && digits.length >= 10 && digits.length <= 15;
}

/** Checks and cleans a reservation from the website. Pure function (tested outside Apps Script). */
function validateReservation(b) {
  b = b || {};
  var clean = function (s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); };
  var name = clean(b.name, 80), contact = clean(b.contact, 120), day = clean(b.pickup_day, 40);
  if (!name) return { ok: false, error: 'Please add your name.' };
  if (!isPhoneOrEmail(contact)) return { ok: false, error: 'Please add a phone number (10 digits) or an email address so we can confirm.' };
  if (!day) return { ok: false, error: 'Please pick a pickup day.' };
  var items = (Array.isArray(b.items) ? b.items : []).map(function (x) {
      var m = String(x).trim().match(/^P0*(\d{1,4})$/i);
      return m ? 'P' + ('00' + Number(m[1])).slice(-3) : '';
    }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  if (!items.length) return { ok: false, error: 'Your pickup list is empty.' };
  if (items.length > 15) return { ok: false, error: 'Please reserve 15 items or fewer at a time.' };
  return { ok: true, name: name, contact: contact, day: day, items: items };
}

/* ------------------------------------------------------------------ */
/* Adding and changing items                                          */
/* ------------------------------------------------------------------ */

function addItem_(photo, note, photoCount) {
  var img = preparePhoto_(photo);
  var ai = aiListing_(img, note);
  var notePrice = parsePrice(note);
  var price = notePrice != null ? notePrice : (typeof ai.price === 'number' ? ai.price : '');
  var sh = productsSheet_();
  var id = nextId_(sh);
  var file = getPhotoFolder_().createFile(img.setName(id + '.jpg'));
  var now = new Date();
  var row = [id, 'available', clip_(ai.name, 50), validCategory(ai.category, note), price,
    clip_(ai.description, 140), clip_(ai.tag || 'New', 16), 'img/products/' + id + '.jpg', file.getId(), '', now, now];
  sh.appendRow(row);

  var lines = ['Posted ' + id + ': ' + row[2] + ' - ' + (price === '' ? 'no price yet' : '$' + price) + ' (' + row[3] + ')',
    'Description: ' + row[5], '', 'It will show on ' + CONFIG.SITE_URL + ' in about a minute.'];
  if (price === '') lines.push('', 'No price was in your note, so the site says "Price at booth". To add one, reply: price ' + id + ' 15');
  if (photoCount > 1) lines.push('', 'You sent ' + photoCount + ' photos. I used the first one. Send one email per item.');
  lines.push('', 'Not right? Reply with, for example:', '  fix ' + id + ' call it a wristlet', '  price ' + id + ' 18', '  sold ' + id);
  return lines.join('\n');
}

function applyCommand_(cmd, photos) {
  var sh = productsSheet_();
  var rows = readRows_(sh);
  var match = findItem(rows.map(function (r) { return { id: r.ID, name: r.Name }; }), cmd.ref);
  if (!match.id) {
    return match.reason + '\n\nUse the item code from the robot email (like P013), or reply "list" to see all codes.';
  }
  var r = rows.filter(function (x) { return x.ID === match.id; })[0];
  var set = {};
  var said = '';
  switch (cmd.type) {
    case 'status':
      set.Status = cmd.status;
      said = { sold: 'Marked SOLD and removed from the site', reserved: 'Marked ON HOLD', available: 'Back on the site as available', hidden: 'Hidden from the site' }[cmd.status];
      break;
    case 'price':
      if (cmd.price == null) return 'I could not read the new price. Example: price ' + r.ID + ' 18';
      set.Price = cmd.price; said = 'Price changed to $' + cmd.price; break;
    case 'fix':
      var upd = aiFix_(r, cmd.text);
      ['Name', 'Description', 'Category', 'Tag'].forEach(function (k) {
        var v = upd[k.toLowerCase()];
        if (typeof v === 'string' && v.trim()) set[k] = k === 'Category' ? validCategory(v, '') : clip_(v, k === 'Description' ? 140 : 50);
      });
      said = 'Updated'; break; // price only changes through the "price" command
    case 'photo':
      if (!photos.length) return 'Attach the new photo to the email, with "photo ' + r.ID + '" as the message.';
      var img = preparePhoto_(photos[0]);
      var file = getPhotoFolder_().createFile(img.setName(r.ID + '-' + Date.now() + '.jpg'));
      var path = 'img/products/' + r.ID + '-' + Date.now() + '.jpg';
      set.Image = path; set['Photo File'] = file.getId(); set.Uploaded = '';
      said = 'Photo replaced'; break;
  }
  set.Updated = new Date();
  writeRow_(sh, r._row, set);
  var after = readRows_(sh).filter(function (x) { return x.ID === r.ID; })[0];
  return said + ': ' + after.ID + ' ' + after.Name + ' - ' + (after.Price === '' ? 'no price' : '$' + after.Price) + ' (' + after.Status + ')' +
    (cmd.type === 'fix' ? '\nDescription: ' + after.Description : '');
}

function listText_() {
  var rows = readRows_(productsSheet_());
  if (!rows.length) return 'The store is empty.';
  var groups = {};
  rows.forEach(function (r) { (groups[r.Status] = groups[r.Status] || []).push(r); });
  var out = [];
  ['available', 'reserved', 'hidden', 'draft', 'sold'].forEach(function (s) {
    if (!groups[s]) return;
    out.push(s.toUpperCase() + ' (' + groups[s].length + ')');
    groups[s].forEach(function (r) { out.push('  ' + r.ID + '  ' + r.Name + '  ' + (r.Price === '' ? 'no price' : '$' + r.Price)); });
    out.push('');
  });
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* Publishing to GitHub                                               */
/* ------------------------------------------------------------------ */

function publish_(force) {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token || /YOUR-GITHUB-USERNAME/.test(CONFIG.GITHUB_REPO)) return 'Publish failed: GitHub settings missing (run setup to see what is missing).';
  var sh = productsSheet_();
  var rows = readRows_(sh);
  var files = [];
  var uploadedRows = [];
  rows.forEach(function (r) {
    if (r['Photo File'] && r.Uploaded !== true && String(r.Uploaded).toUpperCase() !== 'TRUE') {
      try {
        var blob = DriveApp.getFileById(r['Photo File']).getBlob();
        files.push({ path: r.Image, base64: Utilities.base64Encode(blob.getBytes()) });
        uploadedRows.push(r);
      } catch (e) { /* photo missing; item stays off the site until fixed */ }
    }
  });
  var live = rows.filter(function (r) {
    var photoOk = !r['Photo File'] || r.Uploaded === true || String(r.Uploaded).toUpperCase() === 'TRUE' || uploadedRows.indexOf(r) > -1;
    return r.ID && r.Name && r.Image && photoOk && (r.Status === 'available' || r.Status === 'reserved');
  }).map(function (r) {
    return { id: r.ID, status: r.Status, name: String(r.Name), category: validCategory(r.Category, ''),
      price: r.Price === '' || isNaN(Number(r.Price)) ? null : Number(r.Price),
      description: String(r.Description || ''), tag: String(r.Tag || ''), image: String(r.Image) };
  });
  var json = JSON.stringify({ updated: new Date().toISOString(), products: live }, null, 1); // categories live in the site itself
  var hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(live)));
  var props = PropertiesService.getScriptProperties();
  if (!force && !files.length && props.getProperty('LAST_HASH') === hash) return 'No changes to publish.';

  files.push({ path: 'products.json', base64: Utilities.base64Encode(json, Utilities.Charset.UTF_8) });
  try {
    githubCommit_(token, files, 'Store update: ' + live.length + ' items' + (uploadedRows.length ? ', ' + uploadedRows.length + ' new photo(s)' : ''));
  } catch (e) {
    return 'Publish failed: ' + e.message;
  }
  uploadedRows.forEach(function (r) { writeRow_(sh, r._row, { Uploaded: true }); });
  props.setProperty('LAST_HASH', hash);
  return 'Published ' + live.length + ' items to ' + CONFIG.SITE_URL + '. It updates in about a minute.';
}

/** Commits several files in ONE commit using the Git Data API. */
function githubCommit_(token, files, message) {
  var api = 'https://api.github.com/repos/' + CONFIG.GITHUB_REPO;
  var gh = function (method, path, payload) {
    var res = UrlFetchApp.fetch(api + path, {
      method: method, muteHttpExceptions: true, contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      payload: payload ? JSON.stringify(payload) : undefined
    });
    var code = res.getResponseCode();
    if (code >= 300) throw new Error('GitHub ' + code + ' on ' + path + ': ' + res.getContentText().slice(0, 200));
    return JSON.parse(res.getContentText());
  };
  var head = gh('get', '/git/ref/heads/' + CONFIG.GITHUB_BRANCH).object.sha;
  var baseTree = gh('get', '/git/commits/' + head).tree.sha;
  var tree = files.map(function (f) {
    var blob = gh('post', '/git/blobs', { content: f.base64, encoding: 'base64' });
    return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha };
  });
  var newTree = gh('post', '/git/trees', { base_tree: baseTree, tree: tree }).sha;
  var commit = gh('post', '/git/commits', { message: message, tree: newTree, parents: [head] }).sha;
  gh('patch', '/git/refs/heads/' + CONFIG.GITHUB_BRANCH, { sha: commit });
}

/* ------------------------------------------------------------------ */
/* AI                                                                 */
/* ------------------------------------------------------------------ */

var LISTING_RULES = 'You write product listings for Pinpanacraft, a small booth at the Ybor City Market in Tampa. ' +
  'It sells upcycled denim bags and pouches made from old jeans and recycled rice bags, embroidered bags and coin pouches, elephant pants, resin coasters, trays, vases, keychains and pens, jewelry, and small gifts like fabric elephant keychains. ' +
  'Write plainly and warmly, like the maker talking to a customer. No hype words, no emoji, no exclamation marks. ' +
  'Only mention materials and details that are visible in the photo or stated in the note.';

function aiListing_(imageBlob, note) {
  var prompt = LISTING_RULES + '\n\nThe maker sent this photo with the note: """' + note.slice(0, 600) + '"""\n\n' +
    'Return ONLY a JSON object with these keys:\n' +
    '  "name": short product name, max 40 characters, like "Denim pouch, pink flower"\n' +
    '  "category": exactly one of these ids: ' + CATEGORY_HELP + '\n' +
    '  "description": one sentence, max 110 characters\n' +
    '  "price": a number ONLY if the note states a price, otherwise null\n' +
    '  "tag": "" or a 1-2 word label such as "New" or "One of a kind"';
  var out = callAI_(prompt, imageBlob);
  if (!out.name) throw new Error('the AI did not return a product name');
  return out;
}

function aiFix_(row, instruction) {
  var current = { name: row.Name, category: row.Category, description: row.Description, tag: row.Tag, price: row.Price === '' ? null : Number(row.Price) };
  var prompt = LISTING_RULES + '\n\nCurrent listing: ' + JSON.stringify(current) + '\n' +
    'The maker asked for this change: """' + instruction.slice(0, 400) + '"""\n\n' +
    'Return ONLY a JSON object with the full updated listing using the same keys (name max 40 characters, description max 110 characters, ' +
    'category is one of these ids: ' + CATEGORY_HELP + '). Change only what was asked.';
  return callAI_(prompt, null);
}

function callAI_(prompt, imageBlob) {
  var p = PropertiesService.getScriptProperties();
  var res, text;
  if (CONFIG.AI_PROVIDER === 'claude') {
    var key = p.getProperty('ANTHROPIC_API_KEY');
    if (!key) throw new Error('ANTHROPIC_API_KEY is missing in Script Properties');
    var content = [];
    if (imageBlob) content.push({ type: 'image', source: { type: 'base64', media_type: imageBlob.getContentType(), data: Utilities.base64Encode(imageBlob.getBytes()) } });
    content.push({ type: 'text', text: prompt });
    res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({ model: CONFIG.CLAUDE_MODEL, max_tokens: 500, messages: [{ role: 'user', content: content }] })
    });
    if (res.getResponseCode() >= 300) throw new Error('Claude API ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
    text = JSON.parse(res.getContentText()).content.map(function (c) { return c.text || ''; }).join('');
  } else {
    var gkey = p.getProperty('GEMINI_API_KEY');
    if (!gkey) throw new Error('GEMINI_API_KEY is missing in Script Properties');
    var parts = [{ text: prompt }];
    if (imageBlob) parts.push({ inline_data: { mime_type: imageBlob.getContentType(), data: Utilities.base64Encode(imageBlob.getBytes()) } });
    res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + CONFIG.GEMINI_MODEL + ':generateContent', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': gkey },
      payload: JSON.stringify({ contents: [{ parts: parts }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } })
    });
    if (res.getResponseCode() >= 300) throw new Error('Gemini API ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
    var data = JSON.parse(res.getContentText());
    text = (((data.candidates || [])[0] || {}).content || { parts: [] }).parts.map(function (x) { return x.text || ''; }).join('');
  }
  var obj = extractJson(text);
  if (!obj) throw new Error('the AI reply was not readable');
  return obj;
}

/* ------------------------------------------------------------------ */
/* Photos                                                             */
/* ------------------------------------------------------------------ */

/** Resizes (and converts HEIC to JPEG) using Drive's thumbnail service. Falls back to the original. */
function preparePhoto_(attachment) {
  var original = attachment.copyBlob();
  var temp = DriveApp.createFile(original.setName('temp-' + Date.now()));
  try {
    var url = 'https://drive.google.com/thumbnail?sz=w' + CONFIG.PHOTO_WIDTH + '&id=' + temp.getId();
    for (var i = 0; i < 6; i++) {
      Utilities.sleep(i === 0 ? 1500 : 2500);
      var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true, followRedirects: true });
      var type = String(res.getHeaders()['Content-Type'] || res.getHeaders()['content-type'] || '');
      if (res.getResponseCode() === 200 && /^image\//.test(type) && res.getContent().length > 5000) {
        return res.getBlob().setContentType('image/jpeg');
      }
    }
  } finally {
    temp.setTrashed(true);
  }
  if (original.getBytes().length > 4500000) throw new Error('the photo is too large. Send it at "Medium" or "Large" size instead of "Actual size"');
  if (!/jpe?g|png|webp/i.test(original.getContentType())) throw new Error('that photo format is not supported. Send it as a JPEG');
  return original;
}

function getPhotoFolder_() {
  var it = DriveApp.getFoldersByName(CONFIG.PHOTO_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.PHOTO_FOLDER);
}

/* ------------------------------------------------------------------ */
/* Sheet helpers                                                      */
/* ------------------------------------------------------------------ */

function productsSheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_PRODUCTS);
  if (!sh) throw new Error('the Products tab is missing. Run Pinpanacraft > Run first-time setup');
  return sh;
}

function readRows_(sh) {
  var values = sh.getDataRange().getValues();
  var head = values.shift();
  return values.map(function (v, i) {
    var o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = typeof v[j] === 'string' ? v[j].trim() : v[j]; });
    o.ID = String(o.ID || '').toUpperCase();
    o.Status = String(o.Status || 'available').toLowerCase();
    return o;
  }).filter(function (o) { return o.ID; });
}

function writeRow_(sh, rowNum, set) {
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  Object.keys(set).forEach(function (k) {
    var col = head.indexOf(k);
    if (col > -1) sh.getRange(rowNum, col + 1).setValue(set[k]);
  });
}

function nextId_(sh) {
  var max = 0;
  readRows_(sh).forEach(function (r) { var n = parseInt(String(r.ID).replace(/\D/g, ''), 10); if (n > max) max = n; });
  return 'P' + ('00' + (max + 1)).slice(-3);
}

function processedIds_() {
  var log = SpreadsheetApp.getActive().getSheetByName(SHEET_LOG);
  var seen = {};
  if (!log || log.getLastRow() < 2) return seen;
  var start = Math.max(2, log.getLastRow() - 1000);
  log.getRange(start, 5, log.getLastRow() - start + 1, 1).getValues().forEach(function (v) { seen[v[0]] = true; });
  return seen;
}

function log_(from, request, result, id) {
  var log = SpreadsheetApp.getActive().getSheetByName(SHEET_LOG);
  if (log) log.appendRow([new Date(), from, String(request).slice(0, 200), String(result).slice(0, 300), id]);
}

function isAllowed_(email) {
  var bare = function (e) { return String(e).toLowerCase().replace(/\+[^@]*@/, '@'); };
  return CONFIG.ALLOWED_SENDERS.map(bare).indexOf(bare(email)) > -1;
}

function senderEmail_(from) {
  var m = String(from).match(/<([^>]+)>/);
  return (m ? m[1] : String(from)).trim().toLowerCase();
}

function clip_(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
function firstLine_(t) { return (String(t || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean)[0]) || ''; }

/* ------------------------------------------------------------------ */
/* Pure helpers (no Google services; tested outside Apps Script)      */
/* ------------------------------------------------------------------ */

/** Removes quoted replies, signatures and "Sent from my iPhone". */
function cleanBody(text) {
  var lines = String(text || '').replace(/\r/g, '').split('\n');
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (/^\s*>/.test(l)) break;
    if (/^\s*On\b.*\bwrote:\s*$/i.test(l) || (/^\s*On\b/.test(l) && /wrote:\s*$/i.test(lines[i + 1] || ''))) break;
    if (/^\s*-{2,}\s*$/.test(l) || /^\s*Sent from my /i.test(l) || /^\s*Get Outlook for /i.test(l)) break;
    if (/^\s*-+\s*Original Message\s*-+/i.test(l) || /^\s*From: .+/i.test(l) && out.length) break;
    out.push(l);
  }
  return out.join('\n').trim();
}

function stripReplyPrefix(s) { return String(s || '').replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, '').trim(); }

/** Reads a price from free text: "$15", "15 dollars", "price 15", "15.50". */
function parsePrice(text) {
  var t = String(text || '');
  var m = t.match(/\$\s*(\d{1,4}(?:\.\d{1,2})?)/) || t.match(/\b(\d{1,4}(?:\.\d{1,2})?)\s*(?:dollars?|usd|bucks)\b/i) || t.match(/\bprice\s*:?\s*\$?\s*(\d{1,4}(?:\.\d{1,2})?)\b/i);
  return m ? Number(m[1]) : null;
}

/**
 * Turns the first line of an email into a command.
 * Returns {type: 'status'|'price'|'fix'|'photo'|'list'|'help'|'publish'|'none', ...}
 */
function parseCommand(line) {
  var l = String(line || '').trim().replace(/^[*_"']+|[*_"']+$/g, '');
  var low = l.toLowerCase();
  if (/^(help|commands|\?)\b/.test(low)) return { type: 'help' };
  if (/^(list|inventory|items|show all)\b/.test(low)) return { type: 'list' };
  if (/^(publish|update site|refresh)\b/.test(low)) return { type: 'publish' };
  var m;
  if ((m = l.match(/^(sold|sold out)\s*:?\s+(.+)$/i))) return { type: 'status', status: 'sold', ref: m[2] };
  if ((m = l.match(/^(hold|on hold|reserve|reserved)\s*:?\s+(.+)$/i))) return { type: 'status', status: 'reserved', ref: m[2] };
  if ((m = l.match(/^(available|unhold|back|restock|restocked|relist)\s*:?\s+(.+)$/i))) return { type: 'status', status: 'available', ref: m[2] };
  if ((m = l.match(/^(hide|remove|delete|unlist)\s*:?\s+(.+)$/i))) return { type: 'status', status: 'hidden', ref: m[2] };
  if ((m = l.match(/^price\s*:?\s+(.+?)\s+(?:to\s+|is\s+|=\s*)?\$?\s*(\d{1,4}(?:\.\d{1,2})?)\s*(?:dollars?)?\s*$/i))) return { type: 'price', ref: m[1], price: Number(m[2]) };
  if ((m = l.match(/^price\s*:?\s+(.+)$/i))) return { type: 'price', ref: m[1], price: null };
  if ((m = l.match(/^(fix|edit|change|update)\s*:?\s+(P\d{1,4})\b[\s,:-]*(.*)$/i))) return { type: 'fix', ref: m[2], text: m[3] || '' };
  if ((m = l.match(/^(fix|edit|change|update)\s*:?\s+(.+?)\s*(?::|-|,)\s*(.+)$/i))) return { type: 'fix', ref: m[2], text: m[3] };
  if ((m = l.match(/^(new\s+)?(photo|picture|pic)\s*:?\s+(.+)$/i))) return { type: 'photo', ref: m[3] };
  return { type: 'none' };
}

/** Finds an item by code (P013) or, failing that, by the words in its name. */
function findItem(items, ref) {
  var r = String(ref || '').trim();
  var code = r.match(/\bP\s*0*(\d{1,4})\b/i);
  if (code) {
    var id = 'P' + ('00' + Number(code[1])).slice(-3);
    var hit = items.filter(function (it) { return String(it.id).toUpperCase() === id; })[0];
    return hit ? { id: hit.id } : { reason: 'There is no item ' + id + '.' };
  }
  var stop = { the: 1, a: 1, an: 1, and: 1, with: 1, of: 1, one: 1, item: 1, my: 1 };
  var words = r.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 1 && !stop[w]; });
  if (!words.length) return { reason: 'I could not tell which item you meant.' };
  var scored = items.map(function (it) {
    var name = String(it.name).toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    var nameWords = name.split(/\s+/);
    var score = 0;
    words.forEach(function (w) {
      if (nameWords.indexOf(w) > -1) score += 1;
      else if (nameWords.some(function (n) { return n.length > 3 && (n.indexOf(w) === 0 || w.indexOf(n) === 0); })) score += 0.5;
    });
    return { id: it.id, name: it.name, score: score };
  }).sort(function (a, b) { return b.score - a.score; });
  if (!scored.length || scored[0].score < 1) return { reason: 'I could not find an item matching "' + r + '".' };
  if (scored[1] && scored[1].score === scored[0].score) {
    return { reason: 'More than one item matches "' + r + '": ' + scored.filter(function (s) { return s.score === scored[0].score; }).slice(0, 5).map(function (s) { return s.id + ' ' + s.name; }).join(', ') + '.' };
  }
  return { id: scored[0].id };
}

function validCategory(cat, note) {
  var c = String(cat || '').toLowerCase().trim();
  if (CATEGORIES.indexOf(c) > -1) return c;
  var t = (c + ' ' + String(note || '')).toLowerCase();
  if (/jean|denim/.test(t)) return 'denim';
  if (/pant|trouser|shirt|dress|skirt|clothing|wear\b/.test(t)) return 'clothing';
  if (/coaster|tray|dish|vase|resin home/.test(t)) return 'resin-home';
  if (/resin|\bpen\b/.test(t)) return 'resin-gifts';
  if (/earring|bracelet|necklace|jewel|pendant|ring\b/.test(t)) return 'jewelry';
  if (/bag|backpack|clutch|tote|purse|wallet|pouch/.test(t)) return 'bags';
  return 'gifts';
}

/** Pulls the first JSON object out of an AI reply, even if it is wrapped in text or code fences. */
function extractJson(text) {
  var t = String(text || '').replace(/```json|```/gi, '');
  var a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}

if (typeof module !== 'undefined') module.exports = { isPhoneOrEmail: isPhoneOrEmail, validateReservation: validateReservation, cleanBody: cleanBody, stripReplyPrefix: stripReplyPrefix, parsePrice: parsePrice, parseCommand: parseCommand, findItem: findItem, validCategory: validCategory, extractJson: extractJson, HELP_TEXT: HELP_TEXT };
