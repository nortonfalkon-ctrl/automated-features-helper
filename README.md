# Automated Features Helper

Foundry VTT v13 / dnd5e 5.3.x helper module for automating selected D&D 5e class features, combat styles, and skill-related automations.

## Current features

### Бой большим оружием / Great Weapon Fighting

For a heavy melee weapon attack, the module checks only the weapon's base damage dice. If their total is below 6, that base weapon dice part is raised to 6. Extra dice from maneuvers, smites, spells, criticals, effects, and other sources are not modified.

### Златоуст / Silver Tongue

For an actor with the `Златоуст` / `Silver Tongue` feature, d20 results from 1 to 9 count as 10 on Charisma (Persuasion) and Charisma (Deception) checks.

## Settings

The module has separate toggles for Great Weapon Fighting and Silver Tongue, feature-name checks, chat notes, and debug logging.

## Compatibility

- Foundry VTT v13
- dnd5e 5.3.x


## Порча / Corruption Charges

When an actor spends a spell slot of 1st level or higher, the module automatically adds 1 charge to an item counter named `Порча` or `Corruption`.

For dnd5e 5.x limited uses, the module mirrors the manual workaround of consuming `-1` item charges: it lowers `system.uses.spent` by 1, so the counter can temporarily exceed its normal recovery maximum until a long rest resets it.
