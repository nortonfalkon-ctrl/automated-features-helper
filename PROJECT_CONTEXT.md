# Automated Features Helper — Project Context

Automated Features Helper is a Foundry VTT v13 / dnd5e 5.3.x module for automating selected D&D 5e class features, combat styles, and skill-related automations.

## Packaging

ZIP release filename is versioned, for example `automated-features-helper-v0.2.2.zip`. The folder inside the archive must be exactly `automated-features-helper`.

## Current features

### Great Weapon Fighting / Бой большим оружием

If an actor with the feature attacks with a heavy melee weapon, only the weapon's base damage dice are checked. If their total is less than 6, that base dice group is raised to 6. Extra dice from maneuvers, spells, smites, criticals, effects, and other sources must not be modified.

### Silver Tongue / Златоуст

If an actor with the `Златоуст` / `Silver Tongue` feature makes a Charisma (Persuasion) or Charisma (Deception) check, a d20 result from 1 to 9 counts as 10.

## Development notes

- Keep fixes small and local.
- Preserve Foundry VTT v13 and dnd5e 5.3.x compatibility.
- Do not split Silver Tongue into a separate module unless explicitly requested; it is now part of Automated Features Helper.
- User prefers receiving only the ZIP archive link for builds, not separate links to individual files.


## v0.2.2 note
Silver Tongue now has a ChatMessage fallback that detects Persuasion/Deception from message text and speaker actor when dnd5e does not expose Actor.rollSkill context.


## v0.2.2 note
Silver Tongue fallback was rebuilt around preCreateChatMessage/createChatMessage and direct serialized roll mutation because dnd5e skill check cards did not reliably expose roll context through Actor.rollSkill/D20Roll alone.


## v0.2.3 diagnostic fix

The user-provided debug log showed that Automated Features Helper v0.2.2 loaded and patched the expected Silver Tongue hooks, but dnd5e v5.3.3 passed the skill argument as an object instead of a plain string. The module therefore normalized it as `[object object]` and rejected the roll as not Persuasion/Deception. v0.2.3 extracts skill ids from object fields such as `skill`, `skillId`, `skillKey`, `id`, `key`, `slug`, `label`, and localized display fields before checking eligibility. It also makes serialized d20 parsing recursive and tolerant of nonstandard result field names.


## v0.3.1 — Порча / Corruption Charges

Added a Praetor corruption counter automation. The module watches actor spell-slot values and, when any level 1–9 slot decreases, adds one charge per spent slot to the actor item named `Порча` or `Corruption`. For dnd5e 5.x this is implemented by decreasing `system.uses.spent`, matching the manual `-1` item-charge consumption workaround and allowing charges above the normal recovery maximum until long rest recovery resets the counter.
