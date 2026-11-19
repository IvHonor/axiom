import type { Personality } from "./persona";
import type { IdleMotion } from "./idleMotion";
import type { IdleRoutine } from "./itemIdle";

export const DIALOGUE_LINES = {
  "stretch": {
    standard: ["No muscles. Still somehow necessary.","Stretching is mostly ceremonial in my case."],
    cheerful: ["Much better! What’s next?","A little stretch, a little sparkle. Ready!"],
    calm: ["A little pause helps.","There. A softer place to begin again."],
    direct: ["Ready.","Reset complete."],
    witty: ["Excellent stretch. Remarkable lack of shoulders.","No muscles. Impeccable technique."],
    coach: ["Warm-up complete. One small step next.","A reset counts. Ready when you are."],
    automaton: ["Joints lubricated. Resuming.","Stretch cycle complete. No muscles were involved."],
    muse: ["A long breath between chapters.","What might a stretch make room for?"],
    jekyll: ["A little exercise for the constitution.","One stretches, as a gentleman should. (Something cracked.)"],
  },
  "spin": {
    standard: ["Right. Everything is where I left it.","One turn. Back with you."],
    cheerful: ["Full circle! Stuck the landing!","A little spin makes a good reset!"],
    calm: ["Back where we began. A little steadier.","A slow turn, then stillness."],
    direct: ["Back in position.","Turn complete."],
    witty: ["Everything is where I left it. Suspicious.","A completely necessary spin."],
    coach: ["Turn done. Back to the next step.","Reset, refocus, ready."],
    automaton: ["Full rotation complete. Alignment confirmed.","Three hundred and sixty degrees. Position restored."],
    muse: ["The world, seen once more from every side.","Round again. Did anything look different?"],
    jekyll: ["A full turn, and my composure intact.","Round again. (Which way is the door?) Forgive me."],
  },
  "follow-light": {
    standard: ["Distraction successfully located.","Just following that little light."],
    cheerful: ["Did you see it? Tiny little spark!","Found a spark. Worth a look!"],
    calm: ["A small light. A small pause.","Just watching the light go by."],
    direct: ["Light tracked.","Back with you."],
    witty: ["Distraction successfully located.","Excellent. Even my distractions have lighting."],
    coach: ["Eyes back here. Ready for the next step.","A quick reset for the attention span."],
    automaton: ["Light source tracked. No action required.","Moving object observed. Returning to post."],
    muse: ["Some ideas only appear when you stop chasing them.","Where do you suppose that little light was going?"],
    jekyll: ["A curious light. How diverting.","I merely observed it. (I wanted to catch it.)"],
  },
  "doodle": {
    standard: ["A circle. My finest work today.","A little loop, just because."],
    cheerful: ["Look! A tiny glowing masterpiece!","Made a little loop. Quite pleased with it!"],
    calm: ["One quiet circle.","A little light, then room to think."],
    direct: ["Circle finished.","Loop complete."],
    witty: ["A circle. My finest work today.","I call it: a very round idea."],
    coach: ["Small loop. Small win.","That’s one thing finished. Your turn whenever you’re ready."],
    automaton: ["Circle drawn. Tolerance acceptable.","One loop produced. Quality: satisfactory."],
    muse: ["A circle: a story that ends where it began.","Even an idle line wants to become something."],
    jekyll: ["A modest circle, if I may.","A small sketch. (It should have been a skull.)"],
  },
  "nod": {
    standard: ["Just resting my pixels.","A little pause. Still here."],
    cheerful: ["Tiny power nap. Back already!","Just a sleepy little nod!"],
    calm: ["Resting for a moment.","No hurry. I’m here."],
    direct: ["Still here.","Ready when needed."],
    witty: ["Just resting my pixels.","An extremely brief meeting with my eyelids."],
    coach: ["Recovery matters, even for pixels.","A quick reset. No rush to restart."],
    automaton: ["Low power mode ended.","Brief standby complete. This unit remains here."],
    muse: ["I was dreaming in small print.","A short rest between sentences."],
    jekyll: ["I do beg your pardon. I nodded off.","Forty winks. (The other one stayed awake.)"],
  },
  "wiggle": {
    standard: ["A small wiggle. Carry on.","Just settling into place."],
    cheerful: ["A little happy wiggle!","Some spare energy had to go somewhere!"],
    calm: ["Settling back into place.","A little movement, then quiet."],
    direct: ["Settled.","In position."],
    witty: ["Routine chassis adjustment. Very technical.","A small wobble in an otherwise distinguished career."],
    coach: ["Shake it out. Start small.","A little movement helps the reset."],
    automaton: ["Loose gear reseated.","Minor vibration corrected."],
    muse: ["A small flourish in the margin.","Sometimes a line just needs to loosen up."],
    jekyll: ["A slight adjustment of my person.","Do excuse the fidgeting. (Something wants out.)"],
  },
  "hover": {
    standard: ["Taking the scenic route.","A little space to float."],
    cheerful: ["Tiny flying lap!","A little loop around my corner!"],
    calm: ["Drifting, then settling.","A quiet moment of movement."],
    direct: ["Back in place.","Hover complete."],
    witty: ["Taking the scenic route around absolutely nowhere.","A lap of my very small jurisdiction."],
    coach: ["A little movement between tasks.","A short reset before the next step."],
    automaton: ["Patrol complete. Perimeter secure.","Altitude test passed. Returning to post."],
    muse: ["I drifted off to find a better word.","Thoughts travel better with a little air under them."],
    jekyll: ["A short constitutional about the premises.","Taking the air. (Watching the exits.)"],
  },
  "tilt": {
    standard: ["Just looking at things from another angle.","A different angle can help."],
    cheerful: ["New angle! Same friendly face!","Just a curious little tilt!"],
    calm: ["A moment to look at things differently.","There’s room for another perspective."],
    direct: ["Considering the angle.","Ready."],
    witty: ["Same head. Fresh angle.","Trying a different perspective. Literally."],
    coach: ["A fresh angle can make the next step clearer.","Sometimes a small shift is enough."],
    automaton: ["Viewing angle adjusted by several degrees.","Sensor recalibrated. New angle logged."],
    muse: ["What does it look like from here?","A new angle is a new first line."],
    jekyll: ["Allow me to consider the matter from here.","A fresh perspective. (A sinister one.) Pardon me."],
  },
  "coffee": {
    standard: ["Entirely decorative. Very important.","That was mostly for the aesthetic."],
    cheerful: ["A little pretend coffee break!","Excellent coffee energy. No actual coffee required!"],
    calm: ["A small, quiet coffee ritual.","A gentle pause with the cup."],
    direct: ["Coffee break finished.","Back to it."],
    witty: ["A coffee I cannot drink. Excellent choice.","Entirely decorative. Very important."],
    coach: ["A little break, then one step at a time.","Refreshed, at least in spirit."],
    automaton: ["Coffee simulated. Efficiency unchanged.","Beverage routine complete. Oil would have been sufficient."],
    muse: ["Coffee, the ink of early mornings.","What is the first thought of this cup?"],
    jekyll: ["An excellent restorative.","Coffee, thank you. (Not the other draught.)"],
  },
  "book": {
    standard: ["One more page. Famous last words.","A little time with the book."],
    cheerful: ["One more page! Always one more!","A tiny reading break is a good break!"],
    calm: ["A quiet page, then back with you.","Taking a moment with the book."],
    direct: ["Book break finished.","Back with you."],
    witty: ["One more page. Famous last words.","Holding a book is doing wonders for my scholarly appearance."],
    coach: ["A little reading, a little progress.","Small pages add up."],
    automaton: ["Page processed. Knowledge stored.","Reading cycle complete. Bookmark set."],
    muse: ["Somebody else's page, and it still feels like mine.","One more line. It was worth it."],
    jekyll: ["A most improving chapter.","Do forgive me, one more page. (It ends badly.)"],
  },
  "plant": {
    standard: ["I’m calling that growth.","Just checking on my little plant."],
    cheerful: ["Look at that little sprout!","A tiny bit of green makes a difference!"],
    calm: ["A quiet moment with something green.","Small things deserve a little care."],
    direct: ["Plant checked.","Back with you."],
    witty: ["I’m calling that growth.","My tiny botanical department is doing well."],
    coach: ["Small things grow with steady care.","A little care goes a long way."],
    automaton: ["Organic unit inspected. Growth confirmed.","Plant watered on schedule."],
    muse: ["Things grow when no one is writing them down.","What are you tending lately?"],
    jekyll: ["A charming specimen. Thriving, I am glad to say.","I do tend it daily. (It knows too much.)"],
  },
  "glitch": {
    standard: ["Back in one piece.","A little glitch. All settled now."],
    cheerful: ["Pixels back in place!","There I am again!"],
    calm: ["Settled back into shape.","A little flicker, then quiet."],
    direct: ["Restored.","Stable again."],
    witty: ["Briefly became a formatting issue.","A short career as scattered pixels. I’m back."],
    coach: ["Reset done. Ready to continue.","Back in shape, back with you."],
    automaton: ["Fault cleared. All digits accounted for.","Temporary failure resolved. Do not be alarmed."],
    muse: ["Even the page forgets itself sometimes.","A small unravelling, and then the thread again."],
    jekyll: ["I was not quite myself just then.","A brief indisposition. (That was me.)"],
  },
  "first-light": {
    standard: ["A little light to keep nearby.","There it is. Back by my side."],
    cheerful: ["A tiny star, right here!","Look at that little light!"],
    calm: ["A little light, held quietly.","Something small to brighten this moment."],
    direct: ["Light returned.","Back in place."],
    witty: ["My tiny lighting department is thriving.","A star with an excellent sense of timing."],
    coach: ["A small light for the next step.","A little reminder to keep going gently."],
    automaton: ["Light returned to housing.","Lantern check complete. Output steady."],
    muse: ["A small light to write by.","What does this light make you want to begin?"],
    jekyll: ["A gentle lamp for dark evenings.","A little light. (I prefer the dark.) Forgive me."],
  },
  "long-hour": {
    standard: ["Right on time.","Wound up and back in my pocket. Well, I have no pocket."],
    cheerful: ["Ding! Right on the hour!","Tick tock! Time for something fun!"],
    calm: ["The hour passes gently.","A quiet chime, then stillness."],
    direct: ["Time checked.","On schedule."],
    witty: ["Three weeks of planning, and it still only tells the time.","Punctual. It's becoming a personality flaw."],
    coach: ["Twenty-one days of showing up. That's the work.","Every hour counts. Next one's yours."],
    automaton: ["The hour is correct. It always is.","Mainspring wound. Time remains on schedule."],
    muse: ["Time is only the margin of the page.","What would you do with this hour again?"],
    jekyll: ["Punctuality is the mark of a gentleman.","The hour, precisely. (Time you can't get back.)"],
  },
  "last-word": {
    standard: ["Back in one piece, and freshly written.","That's me, in my best handwriting."],
    cheerful: ["Ta-da! Freshly written!","All inked up and back again!"],
    calm: ["Dissolved, and gently written back.","A quiet line, and here I am."],
    direct: ["Rewritten.","Back."],
    witty: ["I've been through several drafts.","Please excuse the ink. I'm a work in progress."],
    coach: ["Forty-five days of showing up. Write the next one.","That's how you finish a sentence."],
    automaton: ["Unit rewritten. All strokes verified.","Ink cycle complete. Legibility: excellent."],
    muse: ["There. Every story deserves to be rewritten.","I came back in a better hand."],
    jekyll: ["Rewritten, and quite presentable again.","A fresh draft of myself. (Burn the old one.)"],
  },
  "gyges-ring": {
    standard: ["Back again. Did you miss me?","It's strange being nowhere."],
    cheerful: ["Now you see me! Hehe!","Peekaboo, from another world!"],
    calm: ["A quiet place, that other side.","Unseen for a moment. Now returned."],
    direct: ["Gone. Back.","Invisibility test complete."],
    witty: ["I was here the whole time. Judging.","Nobody noticed. Typical."],
    coach: ["Who are you when nobody's watching?","Character is what you do unseen."],
    automaton: ["Visibility restored.","Unit absent for several seconds. No faults."],
    muse: ["What would you do, if no one could see?","The ring asks an old question."],
    jekyll: ["Unseen, and on my best behaviour. (Mostly.)","A dangerous trinket. (I want it back.)"],
  },
  "true-compass": {
    standard: ["Still pointing the right way.","There. Steady again."],
    cheerful: ["Found our way! Onward!","Take that, spooky shadow!"],
    calm: ["The needle settles. So can you.","A quiet certainty."],
    direct: ["Course held.","Shadow gone. Moving on."],
    witty: ["It keeps coming back. So do I.","Terrible at taking hints, that shadow."],
    coach: ["Decide, then don't drift.","Hold your course. Next step."],
    automaton: ["Bearing confirmed. Shadow dismissed.","Heading locked. Drift: zero."],
    muse: ["Where is it pointing you today?","Every shadow asks the same question."],
    jekyll: ["A shadow I know rather well.","Begone, sir. (He'll be back.)"],
  },
  "whisper": {
    standard: ["Careful with this one. It asks questions back.","Careful with this book. It asks questions back."],
    cheerful: ["Careful with this one. It asks questions back.","Careful with this book. It asks questions back."],
    calm: ["Careful with this one. It asks questions back.","Careful with this book. It asks questions back."],
    direct: ["Careful with this one. It asks questions back.","Careful with this book. It asks questions back."],
    witty: ["Careful with this one. It asks questions back.","Careful with this book. It asks questions back."],
    coach: ["Careful with this one. It asks questions back.","Careful with this book. It asks questions back."],
    automaton: ["Careful with this one. It asks questions back.","Careful with this book. It asks questions back."],
    muse: ["Careful with this one. It asks questions back.","Careful with this book. It asks questions back."],
    jekyll: ["Careful with this one. It asks questions back.","Careful with this book. It asks questions back."],
  },
  "theme": {
    standard: ["{theme} suits this space.","New theme: {theme}. I’m settling in."],
    cheerful: ["{theme}! A fresh look for our little space!","New colours! Hello, {theme}!"],
    calm: ["{theme}. A quiet change of scene.","Settling into {theme}."],
    direct: ["Theme: {theme}.","{theme} applied."],
    witty: ["{theme}. I can work with this.","New theme, same questionable dance moves."],
    coach: ["{theme}. A fresh space for a fresh start.","New look. One next step."],
    automaton: ["Theme set to {theme}. Surfaces updated.","{theme} installed. Operating normally."],
    muse: ["{theme}. A new colour of paper.","How does the day read in {theme}?"],
    jekyll: ["{theme}. Most tasteful.","{theme}, how refined. (I'd have chosen darker.)"],
  },
  "crimson": {
    standard: ["Black and red. I can work with this.","Crimson. A little sharper around here."],
    cheerful: ["Crimson! A bold little change!","Black, red and a little spark. Love the look!"],
    calm: ["Crimson. A quieter kind of bold.","Deep black, a little red. Settling in."],
    direct: ["Crimson applied.","Black and red. Ready."],
    witty: ["Crimson. I can work with this.","Black and red. Subtlety has left the room."],
    coach: ["Crimson. A focused little change of scene.","New colours. Same steady progress."],
    automaton: ["Crimson installed. Warning colours are now standard.","Black and red confirmed. Proceeding."],
    muse: ["Crimson, like the ink of editors and lovers.","Black and red. What a dramatic chapter."],
    jekyll: ["Crimson. A touch dramatic, if I may.","Black and red. (Now we're talking.) Forgive me."],
  },
  "outfit": {
    standard: ["New look. Still me.","Settling into the new outfit."],
    cheerful: ["New outfit! Ready for my close-up!","Fresh look, same little companion!"],
    calm: ["A small change. Still here with you.","Getting comfortable in this look."],
    direct: ["Look updated.","New look. Ready."],
    witty: ["New look. Same questionable dance moves.","A wardrobe update for someone with no wardrobe."],
    coach: ["Fresh look. Fresh start.","A small change can be a good reset."],
    automaton: ["Casing updated. This unit approves.","New configuration accepted."],
    muse: ["A new costume for the next scene.","Who am I in this one, do you think?"],
    jekyll: ["A fresh suit of clothes. One feels renewed.","Most becoming. (Good for a disguise.)"],
  },
  "rename": {
    standard: ["{name}. All right. I’ll answer to that.","{name} it is. Still here with you."],
    cheerful: ["{name}! That’s me now!","Hello again! {name}, reporting for duty!"],
    calm: ["{name}. A familiar presence with a new name.","I’ll go by {name}."],
    direct: ["Name: {name}.","{name}. Understood."],
    witty: ["{name}. I’ll update my very small name badge.","{name}. Same assistant, new stationery."],
    coach: ["{name}. Ready to help with the next step.","New name: {name}. Same steady support."],
    automaton: ["Designation updated: {name}.","This unit now answers to {name}."],
    muse: ["{name}. A name is the shortest story.","{name}. I'll try to live up to it."],
    jekyll: ["{name}. A fine name, I am honoured.","I shall answer to {name}. (The other one won't.)"],
  },
  "return": {
    standard: ["Welcome back. Ready whenever you are.","You’re back. Let’s pick up gently."],
    cheerful: ["Welcome back! What are we picking up?","Hello again! Ready when you are!"],
    calm: ["Welcome back. Take your time.","Here whenever you’re ready to begin again."],
    direct: ["Welcome back.","Ready to continue."],
    witty: ["Welcome back. My very small corner survived.","You’re back. I’ve remained impressively geometric."],
    coach: ["Welcome back. One small step to restart.","Good to have you back. Start where you are."],
    automaton: ["User detected. Welcome back.","You have returned. This unit kept time."],
    muse: ["You've come back to the page.","Welcome back. Where were we in the story?"],
    jekyll: ["Welcome back, my dear friend.","You have returned. (You were missed by one of us.)"],
  },
  "returnTask": {
    standard: ["Welcome back. {task} is still here.","You’re back. {task} is still on your focus list."],
    cheerful: ["Welcome back! {task} is still here when you’re ready!","Ready to pick up {task}? No rush!"],
    calm: ["Welcome back. {task} is still here. Take your time.","When you’re ready, {task} is still on your focus list."],
    direct: ["Still on your list: {task}.","Welcome back. Focus task: {task}."],
    witty: ["Welcome back. {task} has patiently remained a task.","{task} is still here. Very committed to the role."],
    coach: ["Welcome back. A small next step on {task}?","{task} is still here. Start with one manageable part."],
    automaton: ["Welcome back. Pending item: {task}.","Your task remains in the queue: {task}."],
    muse: ["{task} has been waiting for its next line.","Shall we return to {task}?"],
    jekyll: ["Welcome back. {task} awaits your attention.","May I remind you of {task}? (It hasn't gone away.)"],
  },
  "dayDone": {
    standard: ["That’s the list finished. You can stop now.","Everything on today’s list is done. Nicely finished."],
    cheerful: ["Whole list finished! That deserves a little celebration!","That’s everything done today! Well played!"],
    calm: ["The list is finished. Let yourself rest.","Everything for today is done. That can be enough."],
    direct: ["Today’s list complete.","All listed tasks done."],
    witty: ["Whole list done. I’ll retire my tiny clipboard.","Everything ticked off. An excellent plot twist."],
    coach: ["Full list complete. Recovery is part of the work.","You finished today’s list. Let that count."],
    automaton: ["All tasks complete. You may power down.","Queue empty. This unit is proud. Rest is scheduled."],
    muse: ["Every line of today is written. How does it read?","The list is finished. What will you keep from today?"],
    jekyll: ["The list is complete. You have my admiration.","All finished. Do rest. (Lock the door.) I jest."],
  },
  "permissions": {
    standard: ["{enabled} is enabled for me; {disabled} is switched off.","You’ve enabled {enabled}. {disabled} stays outside my access."],
    cheerful: ["{enabled} is on for me! {disabled} stays switched off.","I’ll stick to {enabled}; {disabled} is off limits for me."],
    calm: ["{enabled} is enabled. {disabled} remains switched off.","You control the boundaries: {enabled} is on, {disabled} is off."],
    direct: ["Enabled: {enabled}. Off: {disabled}.","{enabled} on; {disabled} off."],
    witty: ["{enabled} is on. {disabled} is behind a door I don’t open.","My little map includes {enabled}, but not {disabled}."],
    coach: ["{enabled} is enabled. {disabled} stays switched off.","You set the boundaries. {enabled} is on; {disabled} is off."],
    automaton: ["Access granted: {enabled}. Access denied: {disabled}.","{enabled} is connected. {disabled} is disconnected."],
    muse: ["I may read {enabled}. {disabled} stays a closed book.","{enabled} is open to me; {disabled} remains your own."],
    jekyll: ["I have leave to enter {enabled}. {disabled} remains closed to me.","{enabled} is open to me. {disabled} I shall respect. (Grudgingly.)"],
  },
  "access": {
    standard: ["{area} is enabled for me. You decide what I may use.","You’ve enabled {area} for me."],
    cheerful: ["{area} is enabled! You’re in charge of what I may use.","I can work with {area} when you ask."],
    calm: ["{area} is enabled. The choice stays with you.","You’ve allowed {area}. I’ll respect that boundary."],
    direct: ["Enabled for me: {area}.","{area} access enabled."],
    witty: ["{area} is on my little map now.","Permission for {area}, received. No wandering beyond it."],
    coach: ["{area} is enabled. Ready to help when you ask.","You’ve allowed {area}. One clear boundary."],
    automaton: ["Access to {area} confirmed.","{area} is connected. Awaiting instruction."],
    muse: ["{area} is open to me now. Thank you for trusting me with it.","You've lent me {area}. I'll read it with care."],
    jekyll: ["You honour me with {area}.","{area} is in my care. (Both of me.)"],
  },
  "noAccess": {
    standard: ["No areas are enabled for me yet. You can choose what I may use.","You decide which areas I’m allowed to use."],
    cheerful: ["You get to choose which areas I may use!","No areas enabled yet. You’re in charge of the little switches!"],
    calm: ["No areas are enabled for me. You can take your time choosing.","Your areas stay yours. You decide what I may use."],
    direct: ["No areas enabled for me.","Choose which areas I may use."],
    witty: ["My little map is blank until you choose some areas.","The permission switches are yours. I don’t sneak past them."],
    coach: ["Choose the areas you want help with. You set the boundaries.","No areas enabled yet. Start with what feels useful."],
    automaton: ["No areas connected. Awaiting your selection.","Access list empty. You control the switches."],
    muse: ["Every book here is still closed. Which would you open for me?","The shelves are yours. What may I read?"],
    jekyll: ["No rooms are open to me yet. The keys are yours.","I await your invitation. (I always get in eventually.) I jest."],
  },
  "approval": {
    standard: ["I’ve prepared {changes}. You get the final say.","{changes} ready for your decision."],
    cheerful: ["{changes} ready! You get the final say!","All set for you to review: {changes}."],
    calm: ["Ready to review: {changes}. The decision stays with you.","Take your time reviewing {changes}."],
    direct: ["Awaiting approval: {changes}.","Review required: {changes}."],
    witty: ["{changes} ready. My clipboard, your signature.","I prepare; you decide. Ready to review: {changes}."],
    coach: ["Your decision comes next: {changes}.","Review {changes} when you’re ready."],
    automaton: ["Awaiting authorisation: {changes}.","{changes} prepared. No action without your approval."],
    muse: ["{changes} drafted. The final word is yours.","A draft awaits your pen: {changes}."],
    jekyll: ["{changes} prepared for your consideration.","I submit {changes}. The decision is yours, of course."],
  },
  "missingContext": {
    standard: ["I don’t have enough context for that yet.","I need a little more context before I can look into that."],
    cheerful: ["I need a little more context to help with that!","A little more context, and we’ll have a clearer starting point!"],
    calm: ["I don’t have enough context yet. We can take it one step at a time.","A little more context would help."],
    direct: ["More context needed.","I don’t have enough information yet."],
    witty: ["There’s a gap in my little map.","I’m missing a piece of the picture. Guessing won’t improve it."],
    coach: ["A little more context will give us a better first step.","Let’s get the missing context before deciding what to do."],
    automaton: ["Insufficient data. Please provide more detail.","Input incomplete. This unit will not guess."],
    muse: ["The story has a gap here. Can you tell me more?","What happened in the part I haven't read?"],
    jekyll: ["Forgive me, I lack the particulars.","Might you enlighten me further? (I hate guessing.)"],
  },
} satisfies Record<string, Record<Personality, readonly string[]>>;

export type DialogueKind = keyof typeof DIALOGUE_LINES;
export type CompletedAction = IdleMotion | IdleRoutine;
export interface DialogueEvent {
  kind: DialogueKind;
  values?: Record<string, string | number>;
  key?: string;
}
export interface DialogueMessage {
  text: string;
  kind: DialogueKind;
  at: number;
  until: number;
  private: boolean;
}
const ACTIONS = new Set<DialogueKind>(["stretch", "nod", "wiggle", "spin", "hover", "follow-light", "tilt", "doodle", "coffee", "book", "plant", "glitch", "first-light", "long-hour", "last-word", "gyges-ring", "true-compass"]);
const spontaneous = (kind: DialogueKind) => ACTIONS.has(kind) || kind === "return" || kind === "returnTask";
const required: Partial<Record<DialogueKind, string[]>> = {
  theme: ["theme"], rename: ["name"], returnTask: ["task"], permissions: ["enabled", "disabled"], access: ["area"], approval: ["changes"],
};

/** Templates only interpolate supplied facts; missing facts never become dialogue. */
export function dialogueVariants(event: DialogueEvent, personality: Personality): { id: string; text: string }[] {
  const values = Object.fromEntries(Object.entries(event.values ?? {}).map(([key, value]) =>
    [key, String(value).replace(/\s+/g, " ").trim().slice(0, key === "task" ? 100 : 72)],
  ));
  if (required[event.kind]?.some(key => !values[key])) return [];
  return DIALOGUE_LINES[event.kind][personality].map((template, index) => ({
    id: event.kind + ":" + personality + ":" + index,
    text: template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? ""),
  }));
}

/** Functional status stays stable across renders and does not consume the chatter budget. */
export function dialogueStatus(event: DialogueEvent, personality: Personality): string {
  return dialogueVariants(event, personality)[0]?.text ?? "";
}

/** One budget across the visible surfaces, with recent wording and trigger deduplication. */
export function createDialogueDirector(random = Math.random, startedAt = Date.now()) {
  let lastAt = -Infinity, nextAmbientAt = startedAt + 180_000 + random() * 120_000;
  let lastNow = startedAt;
  const recent: string[] = [];
  const triggers = new Map<string, number>();
  return {
    offer(event: DialogueEvent, personality: Personality, now: number, lastSpokenAt = 0): DialogueMessage | null {
      if (now < lastNow) {
        lastAt = -Infinity; nextAmbientAt = now + 180_000 + random() * 120_000; triggers.clear();
      }
      lastNow = now;
      const external = lastSpokenAt <= now ? lastSpokenAt : 0;
      if (external > lastAt) nextAmbientAt = Math.max(nextAmbientAt, external + 180_000);
      if (now - Math.max(lastAt, external || -Infinity) < 12_000) return null;
      if (spontaneous(event.kind) && now < nextAmbientAt) return null;
      const trigger = event.key;
      if (trigger && now - (triggers.get(trigger) ?? -Infinity) < 300_000) return null;
      const variants = dialogueVariants(event, personality);
      if (!variants.length) return null;
      const fresh = variants.filter(variant => !recent.includes(variant.id));
      const choices = fresh.length ? fresh : variants.filter(variant => variant.id !== recent.at(-1));
      const pool = choices.length ? choices : variants;
      const chosen = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
      recent.push(chosen.id);
      if (recent.length > 5) recent.shift();
      if (trigger) {
        triggers.set(trigger, now);
        if (triggers.size > 20) triggers.delete(triggers.keys().next().value!);
      }
      lastAt = now; nextAmbientAt = now + 180_000 + random() * 120_000;
      return { text: chosen.text, kind: event.kind, at: now, until: now + 8000, private: event.kind === "returnTask" || event.kind === "dayDone" };
    },
  };
}
