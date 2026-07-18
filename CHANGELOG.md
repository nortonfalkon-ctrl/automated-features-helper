# Changelog

## v0.3.5

### Fixed
- Added Corruption / Порча long-rest reset logic.
- When a long rest is detected, the module recalculates the base Corruption limit from the Praetor class level and resets the counter back to that base value.
- This preserves temporary over-cap charges gained from spell slots during the adventuring day, while preventing the raised temporary maximum from becoming permanent after a long rest.
- Kept verbose Corruption diagnostics for verification.

## v0.3.4

### Fixed
- Fixed Corruption / Порча charges still staying at the normal maximum when dnd5e clamps `system.uses.value` back down to `system.uses.max`.
- Corruption now temporarily raises both `system.uses.value` and `system.uses.max` when a spell slot is spent, so a counter at `1 / 1` can become `2 / 2` instead of being clamped back to `1 / 1`.
- Kept verbose Corruption diagnostics enabled for verification.

## v0.3.3

### Fixed
- Fixed Corruption / Порча charges not increasing on the actor sheet in dnd5e 5.3.x.
- Corruption now updates `system.uses.value` directly instead of trying to lower `system.uses.spent` below zero, because dnd5e clamps negative spent values back to zero.

## v0.3.2

### Changed
- Added verbose Corruption counter diagnostics for dnd5e item uses: before state, update payload, after state, item id, item uuid, item type, and raw uses data.

## 0.3.1

- Corruption / Порча automation now ignores spell items with the same name.

# 0.3.1

## Added
- Added Corruption / Порча charge automation.
- Spending a spell slot of 1st level or higher now adds 1 charge to a configured counter item named `Порча` or `Corruption`.
- Added settings for enabling the mechanic, counter item names, and chat notes.

# Changelog

## v0.2.3

### Fixed
- Fixed Silver Tongue / Златоуст detection when dnd5e v5.3 passes a full skill object instead of a plain skill id string.
- Improved serialized D20Roll parsing so Silver Tongue can find nested or nonstandard d20 result structures in Foundry/dnd5e chat messages.
- Added support for d20 result fields stored as `result`, `number`, or `value`.

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
