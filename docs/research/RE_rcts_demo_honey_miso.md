# RCTS Demo — Honey Miso Short Rib

**Status:** Research Complete
**Date:** 2026-04-11
**Purpose:** Show exactly what RecursiveCharacterTextSplitter produces on a real recipe transcript using the Phase 1 parameters. Demonstrates sentence accumulation, overlap behaviour, and the effect of unstripped noise tokens.

---

## Parameters Used

| Parameter | Value |
|-----------|-------|
| `separators` | `". "`, `"? "`, `"! "`, `" "`, `""` |
| `chunkSize` | 1,500 chars |
| `chunkOverlap` | 150 chars |
| Separator hit | `". "` only — `?` and `!` fallbacks not triggered |

---

## Source

**Honey Miso Short Rib** — 7,721 chars total → **6 chunks**

---

## Chunks

### Chunk 1 — 1,493 chars *(no overlap — first chunk)*

```
[music] [music] All right, guys. So, today I am bringing you the recipe you've been asking me for. Honey miso short rib recipe. [music] Let's go ahead and get it. All right, so I have all of my ingredients here. I have my green onion, my garlic, ginger, star. I have one shellot [music] shallot, not Charlotte. All my other ingredients here. So, the first thing we need to do, we need to take our short ribs, and we need to go ahead and get them seasoned. So, we're just going to do salt and pepper. Doesn't need [music] a lot. And then we're going to sear them. So, we take our salt. I'm just going to add them to the whole bowl. I'll toss them around. No need to do an individual situation. All right. Some black pepper. I like coarse black pepper. Do as you please. And we just want to go ahead and make sure that they're seasoned on all sides. Get in there. Give them a little toss. Also, another thing, [music] if you buy yours at the store and they come with the bone, I like to just remove the bone. Um, it does add a lot of flavor to keep the bone. it'll add to that broth. But I don't know. I just like having more surface area to sear up that's actually [music] meat. It's just simpler. It's easier. Then you're not fighting with a bone and all that. So, so here we go. We have our short ribs. [music] They are seasoned. We're going to go ahead and start searing them in our pot. All right. Let's go ahead and add [music] our neutral oil. So, I have my high smoke point avocado oil.
```

---

### Chunk 2 — 1,491 chars

**Overlap from chunk 1:**
> "to go ahead and start searing them in our pot. All right. Let's go ahead and add [music] our neutral oil. So, I have my high smoke point avocado oil."

```
to go ahead and start searing them in our pot. All right. Let's go ahead and add [music] our neutral oil. So, I have my high smoke point avocado oil. Add that to the pan. And then we're going to go ahead and drop in our short ribs. All right. We want to get those in there. Pack them in as many as you can. If you have to do it in batches, do what you have to do. Or if you're just making a couple of them, I mean, you can also, you know, All right, so we're getting some color on them. Go ahead and give them all a flip. All right, we're just going to get a little more color on those and then we'll be ready to start our foundation of our miso honey glaze that we're going to be creating. So, we'll give this a couple more minutes to just sear up a bit. All right, so while we're finishing up our sear, let's go ahead and prep our vegetables. So, we're just going to cut our ginger [music] into slices. All of this is going to get strained later. We just want to add that flavor in right now. We'll crush our garlic. That way we can release all of that flavor. So, we're just going to give our green onions a rough chop. And make sure you have enough green onions for later because we're going to be garnishing it up. You know, got to get the vibes. You eat with your eyes first. So, it's important that your food looks good. So, don't use all your green onions throwing them in the pot. All right. Next, we have our shallot. We're just [music] going to take off this outer layer of skin.
```

---

### Chunk 3 — 1,476 chars

**Overlap from chunk 2:**
> "all your green onions throwing them in the pot. All right. Next, we have our shallot. We're just [music] going to take off this outer layer of skin."

```
all your green onions throwing them in the pot. All right. Next, we have our shallot. We're just [music] going to take off this outer layer of skin. And we're just going to throw them in like that just to add another layer of a flavor to our overall dish. So now that that's ready, let's go ahead and check our short ribs. All right, so we got some color. So I'm going to go ahead and pull these out and we're going to set them to the side and start building the base of our sauce. So, we have our garlic, we have our shallot, and toss in our ginger, [music] and last and definitely not least, and throw in our green onions. All right, next we're going to take our mirin and we're going to go ahead and delaze. Give it a stir. Get some of those bits and pieces all off the bottom. All right. So, next we're going to take our miso and we're going to add that to our pot and start to cook that down. [music] So, I have about six short ribs. So, I'm going to put a pretty hefty amount. I want to create a pretty good size sauce. Next, we're going to go in [music] with our soy sauce. And we're going to add a pretty hefty amount. And also our dark soy sauce. All right. And last, we have our honey and two star. [music] We'll go ahead and give that up a stir. And this is the foundation of our overall sauce and [music] glaze. And now we're just going to add our short rib back in, add our broth, and we're going to let this cook for a couple of hours. >> [music] >> All right.
```

---

### Chunk 4 — 1,323 chars

**Overlap from chunk 3:**
> "nd now we're just going to add our short rib back in, add our broth, and we're going to let this cook for a couple of hours. >> [music] >> All right."

```
nd now we're just going to add our short rib back in, add our broth, and we're going to let this cook for a couple of hours. >> [music] >> All right. So, we got our lid on it. We're going to go ahead and put this in our oven now. And we're going to let this cook. And there we have it. Our short ribs will be cooking. [music] You know, like short ribs are one of my favorite things to make. And I'll tell you why. Because they're so luxurious. And [music] I think you associate richness with luxuriousness. They're such like a good fat mouth fill whenever you're having short ribs. And so, you know, when you think about those like really nice date night [music] dinners or, you know, even if you're cooking for yourself, you should have something luxurious. And so, the short [music] ribs are going to cook for a couple of hours and we'll check back in them and finish up this [music] recipe. All right. So, I just checked our short ribs. They are tender. They're ready. [music] So, we're going to go ahead and take them out. I'm going to remove the short rib and then we're going to go ahead and cook down the the sauce so we can get a really nice thick glaze. [music] So, we're going to get this bad boy on out of there. All right, so we're going to go ahead and get our short ribs out. Oh my god, those look beautiful.
```

---

### Chunk 5 — 1,489 chars

**Overlap from chunk 4:**
> ", we're going to get this bad boy on out of there. All right, so we're going to go ahead and get our short ribs out. Oh my god, those look beautiful."

```
, we're going to get this bad boy on out of there. All right, so we're going to go ahead and get our short ribs out. Oh my god, those look beautiful. So, we're going to get those out and then we need to strain all of those vegetables, the ginger and everything and put that back into our pot because we're going to go ahead and reduce it a bit. turn it into a beautiful sauce. Beautiful sauce for our short ribs. All right. All right. Let's set these aside. All right. So, we have our beautiful, beautiful broth [music] and sauce that is about to be made out of this here. We just want to go ahead and strain all of the vegetables out. All right. So, give that a little shake. That way [music] we can kind of strain all that that good juice out. If you want, you can press the [music] vegetables up against the wire mesh, but sometimes it makes chunks fall in. So, I just choose to just let it strain until it's just a few drops coming at a time. All right. So, now we're going to add that leftover broth to our pot. This is where our beautiful sauce is going to go. Oh, I made a huge [music] mess. But that's that's the name of the game sometimes. We cooking now. So, we got our sauce here. We're going to go ahead and add our corn starch slurry to give it a nice thickness once we get it to a little bit of a boil. [music] And we're going to be ready to start plating this up. All right, our cornstarch goes in. [music] All right, we're just going to give that a whisk. All right, guys.
```

---

### Chunk 6 — 1,199 chars

**Overlap from chunk 5:**
> "g to be ready to start plating this up. All right, our cornstarch goes in. [music] All right, we're just going to give that a whisk. All right, guys."

```
g to be ready to start plating this up. All right, our cornstarch goes in. [music] All right, we're just going to give that a whisk. All right, guys. Our sauce is done. We'll do a check here. So, >> this is what we're looking for. See, got a nice thickness to it. And what we're going to do now, I've got some onomi. We're going to add our [music] short rib back in there. Get them nice and coated. And then we're going to go ahead and plate up our short rib. This is going to be perfect. All right. So, we take our short ribs. We're just going to place [music] those right in the center. Two per person. Don't be shy. Then, we're going to take some of that sauce, cuz who doesn't like extra? [music] pour it over the top. All right, we're going to take our garnish [music] of our green onions. This is why I told you guys to save some. And there we have it. [music] We have a beautiful bed of whipped potatoes and our miso honey short rib. And it's ready for a date night coming to you [music] hopefully soon. Or treat yourself. Make some short rib. I swear you're going to love this recipe. Don't forget guys, [music] like, comment, share, and subscribe. And I will see you guys in the next video.
```

---

## Observations

**Sentence accumulation works as expected**
Each chunk groups ~10–15 sentences together before hitting the 1,500 char limit. Two adjacent sentences do not become separate chunks — they are accumulated until `chunkSize` is reached.

**Cuts land on sentence boundaries**
Every chunk boundary falls at a `". "` — no mid-sentence cuts in any of the 6 chunks. The `?` and `!` fallbacks were never triggered; this transcript is all declarative sentences.

**Overlap carries full sentences**
The 150 char overlap region in each chunk is roughly one sentence. Context at the boundary is fully preserved — nothing is lost between chunks.

**Noise is highly visible and pollutes chunk content**
`[music]` appears multiple times per chunk. Chunk 1 opens with `[music] [music]`. Chunk 3 contains `>> [music] >>`. These tags will degrade Gemini summaries if not stripped before the map phase — noise stripping (F1) must run before RCTS.

**Chunk 4 contains no recipe steps**
The entire chunk is the cook reflecting on short ribs being luxurious while they cook in the oven. A Gemini summary of this chunk would return little useful recipe information. This is expected — the map prompt should be tuned to extract only ingredients and cooking steps, not narrative filler.

**Chunk 6 ends with outro content**
"Don't forget guys, like, comment, share, and subscribe" — the final chunk contains sign-off content with no recipe value. Same category of noise as the sponsor segment identified in the Buffalo Wings analysis.
