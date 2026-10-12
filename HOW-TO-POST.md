# How to post to pnpcraft.com

Send everything to **phinphana2+store@gmail.com**

## Add a new item

1. Take one clear photo on a plain background.
2. Email that one photo, with a short note: what it is and the price.
   - Example: `denim pouch with pink flower $15`
3. In a few minutes you get a reply with the item's code, like **P013**. It's now on the website.

One item per email. If you leave out the price, the site shows "Price at booth".

## Change an item

Reply to the robot's email, or send a new one. Put one command per line (several lines in one email is fine):

| Send this | It does this |
|---|---|
| `sold P013` | removes it from the site |
| `hold P013` | shows it as "On hold" for a customer |
| `available P013` | puts it back for sale |
| `price P013 18` | changes the price to $18 |
| `hide P013` | takes it off without marking it sold |
| `fix P013 call it a wristlet` | rewrites the name or description |
| `photo P013` with a new photo attached | replaces the photo |
| `list` | emails you every item and its code |
| `help` | emails you this list |

## When a customer reserves

You get an email titled **New reservation** with the customer's name, phone or email, pickup Saturday and the item codes. Those items already show "On hold" on the website, so nobody else can reserve them.

1. Call, text or email the customer to confirm.
2. After pickup, reply to that email with one line per item, for example `sold P013`.
3. If they cancel or don't show, reply `available P013` to put it back on the site.

Every reservation is also saved in the **Reservations** tab of the store sheet.
