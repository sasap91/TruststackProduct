export const HARD_BLOCKED_TERMS: string[] = [
  // ── Disney (animated characters) ──────────────────────────────────────────
  "mickey mouse", "minnie mouse", "donald duck", "goofy", "simba",
  "elsa", "anna", "moana", "tinker bell", "tinkerbell", "ariel", "belle",
  "jasmine", "cinderella", "snow white", "buzz lightyear", "woody",
  "winnie the pooh", "winnie-the-pooh", "piglet", "tigger", "eeyore",
  "stitch", "lilo", "dumbo", "bambi", "thumper", "flounder", "sebastian",

  // ── Marvel ────────────────────────────────────────────────────────────────
  "spider-man", "spiderman", "iron man", "captain america", "thor",
  "hulk", "black widow", "wolverine", "deadpool", "thanos", "black panther",
  "captain marvel", "scarlet witch", "doctor strange", "loki", "hawkeye",
  "ant-man", "antman", "vision", "falcon",

  // ── DC ────────────────────────────────────────────────────────────────────
  "batman", "superman", "wonder woman", "joker", "aquaman", "the flash",
  "green lantern", "cyborg", "lex luthor", "harley quinn", "catwoman",
  "nightwing", "green arrow",

  // ── Nintendo ──────────────────────────────────────────────────────────────
  "mario", "luigi", "princess peach", "bowser", "pikachu", "pokemon",
  "pokémon", "zelda", "link", "donkey kong", "kirby", "samus", "metroid",
  "fox mccloud", "star fox", "captain falcon", "ness", "lucas",
  "isabelle animal crossing", "tom nook", "villager animal crossing",
  "pikmin", "olimar", "inkling", "splatoon",

  // ── Other video games ─────────────────────────────────────────────────────
  "sonic the hedgehog", "sonic hedgehog", "miles tails prower", "knuckles echidna",
  "shadow the hedgehog", "master chief", "halo spartan",
  "kratos god of war", "lara croft", "ezio auditore", "altaïr", "master chief",
  "cloud strife", "tifa lockhart", "aerith gainsborough", "sephiroth",
  "ryu street fighter", "chun-li", "scorpion mortal kombat", "sub-zero mortal kombat",
  "pac-man", "mega man", "megaman", "crash bandicoot",
  "spyro the dragon", "rayman",
  // Five Nights at Freddy's
  "freddy fazbear", "five nights at freddy", "fnaf", "bonnie fnaf",
  "chica fnaf", "foxy fnaf", "golden freddy",
  // Undertale
  "undertale", "sans undertale", "papyrus undertale", "frisk undertale",
  "toriel undertale", "flowey undertale",
  // Hollow Knight / Cuphead / Indie
  "hollow knight", "cuphead", "mugman cuphead",
  "bendy and the ink machine", "bendy ink machine",
  // Poppy Playtime
  "huggy wuggy", "mommy long legs", "poppy playtime",
  // Viral/current IP
  "skibidi toilet", "garten of banban",

  // ── Ghibli ───────────────────────────────────────────────────────────────
  "totoro", "spirited away", "no-face spirited away", "calcifer", "howl's moving castle",
  "nausicaä", "princess mononoke", "kiki's delivery service",

  // ── Sanrio ────────────────────────────────────────────────────────────────
  "hello kitty", "my melody", "cinnamoroll", "kuromi", "pompompurin",
  "keroppi", "chococat", "little twin stars", "aggretsuko",

  // ── Warner Bros / Hanna-Barbera ───────────────────────────────────────────
  "bugs bunny", "daffy duck", "tweety bird", "sylvester cat", "elmer fudd",
  "porky pig looney tunes", "road runner looney tunes", "wile e coyote",
  "scooby-doo", "scooby doo", "shaggy rogers", "yogi bear", "boo-boo bear",
  "flintstones", "fred flintstone", "barney rubble", "wilma flintstone",
  "jetsons", "george jetson",
  "tom and jerry",

  // ── Sesame Street ─────────────────────────────────────────────────────────
  "elmo sesame", "big bird sesame", "cookie monster", "grover sesame",
  "oscar the grouch", "bert sesame street", "ernie sesame street",
  "sesame street",

  // ── Muppets ───────────────────────────────────────────────────────────────
  "kermit the frog", "miss piggy", "fozzie bear", "gonzo muppet",
  "animal muppet", "the muppets",

  // ── Peanuts / Charlie Brown ────────────────────────────────────────────────
  "snoopy", "charlie brown", "peanuts comic", "woodstock peanuts",
  "lucy van pelt", "linus peanuts", "schroeder peanuts", "pigpen peanuts",

  // ── Dr. Seuss ─────────────────────────────────────────────────────────────
  "cat in the hat", "the grinch", "lorax", "horton hears",
  "thing one thing two", "sam-i-am", "dr seuss", "dr. seuss", "seussian",

  // ── Classic children's books ──────────────────────────────────────────────
  "paddington bear", "thomas the tank engine", "thomas & friends",
  "thomas and friends",

  // ── Modern children's TV IP ───────────────────────────────────────────────
  "peppa pig", "george pig peppa", "daddy pig", "mummy pig",
  "bluey heeler", "bingo heeler", "bandit heeler", "chilli heeler",
  "paw patrol", "chase paw patrol", "marshall paw patrol", "skye paw patrol",
  "rubble paw patrol", "rocky paw patrol", "zuma paw patrol",
  "bob the builder", "fireman sam", "teletubbies", "tinky winky",
  "dipsy teletubby", "laa-laa", "po teletubby",
  "bananas in pyjamas", "in the night garden", "igglepiggle",
  "upsy daisy night garden", "makka pakka",

  // ── Korean/Chinese/global animation ───────────────────────────────────────
  "pororo the little penguin", "boboiboy", "pleasant goat",

  // ── Harry Potter ──────────────────────────────────────────────────────────
  "harry potter", "hermione granger", "ron weasley", "voldemort",
  "dumbledore", "hogwarts",

  // ── Star Wars ─────────────────────────────────────────────────────────────
  "darth vader", "yoda", "luke skywalker", "princess leia", "han solo",
  "r2-d2", "c-3po", "stormtrooper", "darth maul", "kylo ren",
  "baby yoda", "the mandalorian",

  // ── Lord of the Rings / Tolkien ───────────────────────────────────────────
  "gandalf", "frodo baggins", "samwise gamgee", "aragorn",
  "legolas", "gimli tolkien", "gollum tolkien", "bilbo baggins",

  // ── Other major IP ────────────────────────────────────────────────────────
  "shrek", "fiona shrek", "donkey shrek", "puss in boots",
  "kung fu panda", "po panda dreamworks", "spongebob", "patrick star",
  "squidward", "sandy cheeks", "gary snail",
  "dora the explorer", "boots dora", "diego dora",
  "avatar airbender", "aang avatar", "katara avatar", "zuko avatar",
  "transformers optimus prime", "optimus prime", "bumblebee transformer",
  "my little pony", "twilight sparkle", "pinkie pie pony",
  "care bears", "strawberry shortcake",

  // ── Tabletop / TCG IP ─────────────────────────────────────────────────────
  "magic the gathering", "planeswalker magic", "jace beleren",
  "dungeons and dragons beholder", "mind flayer dnd", "beholder dnd",
  "warhammer space marine", "warhammer 40k", "adeptus astartes",
];
