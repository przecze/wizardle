# Wizardle - guess the exact Harry Potter book and chapter with minimal number of words



frontend:

Mobile / portrait mode first

You see two words, you can either:
* make a guess: press on one of the book icons and then select a chapter and then confirm guess
* add a word on the left
* add a word on the right
* once you guess you get an emoji string with game name, date and your path to right guess to share (like wordle)
* also shows slightly longer fragment after you guessed correctly and how your revealed fragment is embedded in it

note: the first two words are always a unique bigram for the whole series. theoretically you can guess already on them. Also we big a bigram at least 15 words away from chapter boundary


API:
python fastapi
can have the full preprocessed dataset loaded

Given date picks randomly but deterministically the chapter and bigram index (from preprocessed list of these that match the initial bigram conditions)
gives out 2 words
api endpoints for submiting a guess, getting one more word (only after providing all previous words to confirm and only on matching date)
api returns max 15 words in either directon 
generally we don't want api to allow extracting arbitrary data
let's say it accepts any date ratehr than looking at system date

api+frontend dev vite+nginx : dev setup
nginx ("site") + api: prod setup

in both prod and ddev you use the same nginx template with a variable that allows minimal relaxing of CSP for frontend

tip: copy this setup from ../jancz_shutupgpt


preprocessing
runnable with uv run, single script, add uv deps header
loads the csv
1st extract the chapter names. first line in chapter contains it. add full chapter name as a column, make sure the first line in chapter does not contain it any more
then we basically want to explode to a pd series of words in order with metadata
* tokenization: |it's| a single token |harry| and |harry,| (,.; attached to previous word) any dashes are a bit tricky because not sure where to attach them, I would say to neither word, but "bigram' counts as two words surrounding the dash. opening quote attached to next word, closing attached to previous same with brackets. list any other punctuation
then warp it into series of bigrams
remove cross-chapter bigrams
give some bigram statistics: most popular bigrams per whole series and per book
for each book example bigrams that are unique to the whole series and their locations (chapter, postion as percentage)
output a plain series of bigrams with metadaata about applicability as opening bigram and which book and chapter and percentage
* should be easy for API to just take the previous/next row to add words and rebuild a whole fragment for final success message


steps:
implement preprocessing and run it and make me see the outputs and stats
add docker compose and full setup for backend frontend nginx, build it, start it, look at all the logs, make some curls
then add "site" prod build of frontend and start it with localhost port, see that it serves frontend files and api calls, look at headers
then add ansible for deploying on bluh (like in jancz_shutupgpt)


