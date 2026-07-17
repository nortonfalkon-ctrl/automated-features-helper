# Changelog

## 0.2.2

### Fixed
- Reworked Silver Tongue / Златоуст chat-message fallback to use Foundry's preCreateChatMessage and createChatMessage hooks.
- Silver Tongue now rewrites serialized roll data directly before the message is saved, which is more reliable for dnd5e 5.3.x skill checks.
- Added stronger actor and skill detection for Russian dnd5e skill check cards.

## 0.2.1

### Fixed
- Improved Silver Tongue / Златоуст detection for dnd5e skill check chat messages.
- Added a ChatMessage fallback that infers Persuasion/Deception from the message text and speaker actor when the dnd5e skill roll context is not exposed to the module.

## v0.2.0

- Added `Златоуст` / `Silver Tongue` automation to Automated Features Helper.
- Silver Tongue applies to Charisma (Persuasion) and Charisma (Deception) checks.
- If the selected d20 result is 1–9, it is treated as 10.
- Added settings for enabling Silver Tongue, requiring the feature, accepted feature names, and chat notes.
- Kept existing Great Weapon Fighting automation unchanged from v0.1.9.

## v0.1.9

- Working Great Weapon Fighting baseline.
- Restored mandatory Great Weapon Fighting feature requirement by default.
- Keeps Strength 13+ as an optional setting.
