/*
 * Automated Features Helper
 * Foundry VTT v13 / dnd5e 5.3.x helper module.
 *
 * v0.1.9 implements Alternate Fighter: Great Weapon Fighting / Бой большим оружием.
 * The working strategy is pre-roll formula rewriting with mandatory actor feature detection.
 */

(() => {
  "use strict";

  const MODULE_ID = "automated-features-helper";
  const MODULE_TITLE = "Automated Features Helper";
  const GREAT_WEAPON_FIXED_MINIMUM = 6;

  const STYLE_NAMES = [
    "бой большим оружием",
    "great weapon fighting",
    "great weapon style",
    "большое оружие"
  ];

  const HEAVY_KEYS = ["hvy", "heavy", "тяжёлое", "тяжелое"];
  const MELEE_ACTIONS = ["mwak", "msak"];

  let activeAttackContexts = [];
  let originalAttackActivityRollDamage = null;
  let originalDamageRollBuildConfigure = null;

  Hooks.once("init", () => {
    registerSettings();
    console.log(`${MODULE_TITLE} | Init.`);
  });

  Hooks.once("ready", () => {
    patchAttackActivityRollDamage();
    patchDamageRollBuildConfigure();
    restoreFeatureRequirementOnce();
    console.log(`${MODULE_TITLE} | Ready v${game.modules.get(MODULE_ID)?.version ?? "unknown"}.`);
  });

  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!game.settings.get(MODULE_ID, "showChatNote")) return;

    const roll = message?.rolls?.find?.(r => r?.options?.combatStyleHelper?.greatWeapon?.formulaRewritten);
    const data = roll?.options?.combatStyleHelper?.greatWeapon;
    if (!data) return;

    const note = document.createElement("div");
    note.className = "csh-chat-note";
    note.innerHTML = game.i18n.format("CSH.GreatWeapon.ChatNote", {
      style: game.i18n.localize("CSH.GreatWeapon.Name"),
      old: data.originalFormula ?? "?",
      min: GREAT_WEAPON_FIXED_MINIMUM,
      delta: ""
    });

    const root = html instanceof HTMLElement ? html : html?.[0] ?? html;
    const target = root?.querySelector?.(".message-content") ?? root;
    target?.append?.(note);
  });

  function registerSettings() {
    game.settings.register(MODULE_ID, "enableGreatWeaponFighting", {
      name: "CSH.Settings.EnableGreatWeapon.Name",
      hint: "CSH.Settings.EnableGreatWeapon.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, "requireStrength13", {
      name: "CSH.Settings.RequireStrength13.Name",
      hint: "CSH.Settings.RequireStrength13.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });

    game.settings.register(MODULE_ID, "requireStyleFeature", {
      name: "CSH.Settings.RequireStyleFeature.Name",
      hint: "CSH.Settings.RequireStyleFeature.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, "featureRequirementRestoredV019", {
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });

    game.settings.register(MODULE_ID, "showChatNote", {
      name: "CSH.Settings.ShowChatNote.Name",
      hint: "CSH.Settings.ShowChatNote.Hint",
      scope: "client",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, "debug", {
      name: "CSH.Settings.Debug.Name",
      hint: "CSH.Settings.Debug.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });
  }

  async function restoreFeatureRequirementOnce() {
    try {
      const migrated = game.settings.get(MODULE_ID, "featureRequirementRestoredV019");
      if (migrated) return;

      if (!game.settings.get(MODULE_ID, "requireStyleFeature")) {
        await game.settings.set(MODULE_ID, "requireStyleFeature", true);
        logDebug("Restored mandatory Great Weapon Fighting feature requirement for v0.1.9.");
      }

      await game.settings.set(MODULE_ID, "featureRequirementRestoredV019", true);
    } catch (err) {
      console.warn(`${MODULE_TITLE} | Could not restore feature requirement setting.`, err);
    }
  }

  function patchAttackActivityRollDamage() {
    const AttackActivity = getAttackActivityClass();
    if (!AttackActivity?.prototype?.rollDamage || AttackActivity.prototype.rollDamage._combatStyleHelperPatched) {
      if (!AttackActivity?.prototype?.rollDamage) console.warn(`${MODULE_TITLE} | Could not find dnd5e AttackActivity.rollDamage.`);
      return;
    }

    originalAttackActivityRollDamage = AttackActivity.prototype.rollDamage;

    AttackActivity.prototype.rollDamage = function combatStyleHelperAttackRollDamage(...args) {
      const item = this?.item ?? this?.parent ?? this?.itemDocument ?? this?.subject?.item ?? null;
      const actor = this?.actor ?? item?.actor ?? this?.parent?.actor ?? this?.subject?.actor ?? null;
      const ctx = { activity: this, item, actor, source: "AttackActivity.rollDamage" };

      activeAttackContexts.push(ctx);
      logDebug(`Entered AttackActivity.rollDamage: actor=${actor?.name ?? "?"}, item=${item?.name ?? "?"}.`);

      const finish = () => {
        const index = activeAttackContexts.lastIndexOf(ctx);
        if (index >= 0) activeAttackContexts.splice(index, 1);
        logDebug(`Left AttackActivity.rollDamage: actor=${actor?.name ?? "?"}, item=${item?.name ?? "?"}.`);
      };

      try {
        const result = originalAttackActivityRollDamage.apply(this, args);
        if (result && typeof result.then === "function") {
          return result.finally ? result.finally(finish) : result.then(v => { finish(); return v; }, e => { finish(); throw e; });
        }
        finish();
        return result;
      } catch (err) {
        finish();
        throw err;
      }
    };

    AttackActivity.prototype.rollDamage._combatStyleHelperPatched = true;
  }

  function patchDamageRollBuildConfigure() {
    const DamageRoll = CONFIG?.Dice?.DamageRoll;
    if (!DamageRoll?.buildConfigure || DamageRoll.buildConfigure._combatStyleHelperPatched) return;

    originalDamageRollBuildConfigure = DamageRoll.buildConfigure;

    DamageRoll.buildConfigure = async function combatStyleHelperBuildConfigure(config = {}, dialog = {}, message = {}) {
      const context = getGreatWeaponContext(config, dialog, message);
      let rewrite = { changed: false };

      if (context) {
        rewrite = rewriteDamageConfigBeforeRoll(config, context);
        if (rewrite.changed) {
          config.rolls ??= [];
          for (const r of config.rolls) {
            r.options ??= {};
            r.options.combatStyleHelper ??= {};
            r.options.combatStyleHelper.greatWeapon = {
              formulaRewritten: true,
              actorUuid: context.actor?.uuid,
              actorName: context.actor?.name,
              itemUuid: context.item?.uuid,
              itemName: context.item?.name,
              originalFormula: rewrite.original,
              rewrittenFormula: rewrite.rewritten,
              minimumWeaponDiceTotal: GREAT_WEAPON_FIXED_MINIMUM
            };
          }
          logDebug(`Great Weapon formula rewrite: ${rewrite.original} -> ${rewrite.rewritten}`);
        } else {
          logDebug("Great Weapon context found, but no formula was rewritten.", config);
        }
      }

      const rolls = await originalDamageRollBuildConfigure.call(this, config, dialog, message);

      // Preserve metadata on produced Roll instances even if dnd5e reconstructs the roll configuration.
      if (rewrite.changed && Array.isArray(rolls)) {
        for (const roll of rolls) {
          roll.options ??= {};
          roll.options.combatStyleHelper ??= {};
          roll.options.combatStyleHelper.greatWeapon ??= {
            formulaRewritten: true,
            actorUuid: context.actor?.uuid,
            actorName: context.actor?.name,
            itemUuid: context.item?.uuid,
            itemName: context.item?.name,
            originalFormula: rewrite.original,
            rewrittenFormula: rewrite.rewritten,
            minimumWeaponDiceTotal: GREAT_WEAPON_FIXED_MINIMUM
          };
        }
      }

      return rolls;
    };

    DamageRoll.buildConfigure._combatStyleHelperPatched = true;
  }

  function rewriteDamageConfigBeforeRoll(config, context) {
    const rolls = Array.isArray(config?.rolls) ? config.rolls : [];
    const dice = context?.dice;

    for (const rollConfig of rolls) {
      const parts = Array.isArray(rollConfig?.parts) ? rollConfig.parts : [];
      for (let i = 0; i < parts.length; i++) {
        if (typeof parts[i] !== "string") continue;
        const result = rewriteOneFormula(parts[i], dice);
        if (!result.changed) continue;
        parts[i] = result.rewritten;
        return result;
      }
    }

    // Some dnd5e paths store the formula one level deeper or under a different key.
    return rewriteNestedStringFormula(config, dice);
  }

  function rewriteOneFormula(formula, dice) {
    const text = String(formula ?? "");
    if (!/\d*d\d+/i.test(text)) return { changed: false };
    if (/\{[^}]*d\d+[^}]*,\s*6\}kh/i.test(text)) return { changed: false };

    const pattern = dice?.number && dice?.faces
      ? new RegExp(`(^|[^a-zA-Z0-9{}])(${dice.number}d${dice.faces})(?![a-zA-Z0-9}])`, "i")
      : /(^|[^a-zA-Z0-9{}])(\d*d\d+)(?![a-zA-Z0-9}])/i;

    const match = text.match(pattern);
    if (!match) return { changed: false };

    const diceText = match[2];
    const rewritten = text.replace(pattern, `${match[1]}{${diceText}, ${GREAT_WEAPON_FIXED_MINIMUM}}kh`);
    return rewritten === text ? { changed: false } : { changed: true, original: text, rewritten };
  }

  function rewriteNestedStringFormula(root, dice) {
    const seen = new Set();
    const skipKeys = new Set(["name", "label", "type", "uuid", "id", "img", "description"]);

    const visit = (value, depth = 0) => {
      if (!value || depth > 6) return { changed: false };
      if (typeof value !== "object") return { changed: false };
      if (seen.has(value)) return { changed: false };
      seen.add(value);
      if (isActorDocument(value) || isItemDocument(value)) return { changed: false };

      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] === "string") {
            const result = rewriteOneFormula(value[i], dice);
            if (result.changed) {
              value[i] = result.rewritten;
              return result;
            }
          } else {
            const result = visit(value[i], depth + 1);
            if (result.changed) return result;
          }
        }
        return { changed: false };
      }

      for (const [key, child] of Object.entries(value)) {
        if (skipKeys.has(String(key).toLowerCase())) continue;
        if (typeof child === "string") {
          const result = rewriteOneFormula(child, dice);
          if (result.changed) {
            value[key] = result.rewritten;
            return result;
          }
        } else {
          const result = visit(child, depth + 1);
          if (result.changed) return result;
        }
      }
      return { changed: false };
    };

    return visit(root);
  }

  function getGreatWeaponContext(config, dialog, message) {
    if (!game.settings.get(MODULE_ID, "enableGreatWeaponFighting")) return null;

    const active = activeAttackContexts[activeAttackContexts.length - 1] ?? {};
    const found = findActorAndItem([config, dialog, message]);
    const item = found.item ?? active.item;
    const actor = found.actor ?? item?.actor ?? active.actor;

    if (!actor || !item) {
      logDebug("Great Weapon skipped: no actor/item context.", { found, active, config, message });
      return null;
    }

    if (item.type !== "weapon") {
      logDebug(`Great Weapon skipped: ${item.name} is not a weapon.`);
      return null;
    }
    if (!isMeleeWeapon(item)) {
      logDebug(`Great Weapon skipped: ${item.name} is not melee.`, item.system);
      return null;
    }
    if (!isHeavyWeapon(item)) {
      logDebug(`Great Weapon skipped: ${item.name} is not heavy.`, item.system?.properties);
      return null;
    }
    if (game.settings.get(MODULE_ID, "requireStrength13") && getStrength(actor) < 13) {
      logDebug(`Great Weapon skipped: ${actor.name} STR ${getStrength(actor)} < 13.`);
      return null;
    }
    if (game.settings.get(MODULE_ID, "requireStyleFeature") && !actorHasGreatWeaponStyle(actor)) {
      logDebug(`Great Weapon skipped: ${actor.name} has no Great Weapon Fighting feature.`);
      return null;
    }

    const dice = getBaseWeaponDice(item);
    logDebug(`Great Weapon eligible: actor=${actor.name}, item=${item.name}, dice=${dice ? `${dice.number}d${dice.faces}` : "first dice fallback"}.`);
    return { actor, item, dice };
  }

  function getAttackActivityClass() {
    const candidates = [
      globalThis.dnd5e?.documents?.activity?.AttackActivity,
      globalThis.dnd5e?.documents?.activities?.AttackActivity,
      globalThis.dnd5e?.documents?.activity?.Attack,
      globalThis.dnd5e?.applications?.activity?.AttackActivity,
      CONFIG?.DND5E?.activityTypes?.attack?.documentClass,
      CONFIG?.DND5E?.activityTypes?.attack?.cls,
      CONFIG?.DND5E?.activityTypes?.attack?.constructor
    ];

    for (const candidate of candidates) {
      if (candidate?.prototype?.rollDamage) return candidate;
    }

    return deepFindAttackActivityClass(globalThis.dnd5e, 6);
  }

  function deepFindAttackActivityClass(root, maxDepth = 6) {
    const seen = new Set();
    const queue = [{ value: root, depth: 0 }];

    while (queue.length) {
      const { value, depth } = queue.shift();
      if (!value || depth > maxDepth) continue;
      if (typeof value !== "object" && typeof value !== "function") continue;
      if (seen.has(value)) continue;
      seen.add(value);

      if (value?.prototype?.rollDamage && String(value?.name ?? "").toLowerCase().includes("attack")) return value;
      if (value?.prototype?.rollDamage && value?.prototype?.constructor?.name === "AttackActivity") return value;

      let entries = [];
      try { entries = Object.entries(value); } catch (_err) { continue; }
      for (const [key, child] of entries) {
        if (!child) continue;
        const keyText = String(key).toLowerCase();
        if (keyText.includes("attack") && child?.prototype?.rollDamage) return child;
        if (depth < maxDepth && (typeof child === "object" || typeof child === "function")) {
          queue.push({ value: child, depth: depth + 1 });
        }
      }
    }
    return null;
  }

  function findActorAndItem(args) {
    const found = { actor: null, item: null };
    const seen = new Set();

    const visit = (value, depth = 0) => {
      if (!value || depth > 5 || (found.actor && found.item)) return;
      if (typeof value !== "object") return;
      if (seen.has(value)) return;
      seen.add(value);

      if (isActorDocument(value)) found.actor ??= value;
      if (isItemDocument(value)) found.item ??= value;
      if (value.actor && isActorDocument(value.actor)) found.actor ??= value.actor;
      if (value.item && isItemDocument(value.item)) found.item ??= value.item;
      if (value.parent && isItemDocument(value.parent)) found.item ??= value.parent;
      if (value.parent?.actor && isActorDocument(value.parent.actor)) found.actor ??= value.parent.actor;

      for (const key of ["subject", "workflow", "activity", "config", "options", "message", "data"]) {
        if (value[key]) visit(value[key], depth + 1);
      }

      if (Array.isArray(value)) for (const v of value) visit(v, depth + 1);
    };

    visit(args);
    return found;
  }

  function isActorDocument(value) {
    return value?.documentName === "Actor" || value?.constructor?.name === "Actor" || (value?.items && value?.system?.abilities);
  }

  function isItemDocument(value) {
    return value?.documentName === "Item" || value?.constructor?.name === "Item" || (value?.type && value?.system && value?.name);
  }

  function actorHasGreatWeaponStyle(actor) {
    const items = Array.from(actor?.items ?? []);
    return items.some(item => {
      const name = String(item?.name ?? "").toLowerCase();
      if (STYLE_NAMES.some(marker => name.includes(marker))) return true;
      const description = String(item?.system?.description?.value ?? "").toLowerCase();
      return STYLE_NAMES.some(marker => description.includes(marker));
    });
  }

  function getStrength(actor) {
    return Number(actor?.system?.abilities?.str?.value ?? actor?.system?.abilities?.str?.score ?? 0);
  }

  function isMeleeWeapon(item) {
    const system = item?.system ?? {};
    const actionType = String(system.actionType ?? system.activation?.type ?? "").toLowerCase();
    if (MELEE_ACTIONS.includes(actionType)) return true;

    const weaponType = String(system.type?.value ?? system.type ?? "").toLowerCase();
    if (weaponType.includes("melee") || weaponType.includes("martialm") || weaponType.includes("simplem")) return true;

    const range = system.range ?? {};
    const rangeValue = String(range.value ?? range.units ?? "").toLowerCase();
    return rangeValue === "touch" || rangeValue === "5" || rangeValue.includes("ft");
  }

  function isHeavyWeapon(item) {
    const values = propertyValues(item?.system?.properties).map(v => String(v).toLowerCase());
    return values.some(v => HEAVY_KEYS.includes(v));
  }

  function propertyValues(props) {
    if (!props) return [];
    if (props instanceof Set) return Array.from(props);
    if (Array.isArray(props)) return props;
    if (typeof props === "object") {
      const out = [];
      for (const [key, value] of Object.entries(props)) {
        if (value === true) out.push(key);
        else if (typeof value === "string") out.push(value);
        else if (Array.isArray(value)) out.push(...value);
      }
      return out;
    }
    return [props];
  }

  function getBaseWeaponDice(item) {
    const formulas = getPossibleBaseDamageFormulas(item);
    for (const formula of formulas) {
      const match = String(formula ?? "").match(/(^|[^a-zA-Z0-9])(\d*)d(\d+)(?![a-zA-Z0-9])/i);
      if (!match) continue;
      const number = Number(match[2] || 1);
      const faces = Number(match[3]);
      if (number && faces) return { number, faces, formula: `${number}d${faces}` };
    }
    return null;
  }

  function getPossibleBaseDamageFormulas(item) {
    const system = item?.system ?? {};
    const formulas = [];

    const base = system.damage?.base;
    if (base) {
      if (base.custom?.enabled && base.custom?.formula) formulas.push(base.custom.formula);
      const number = Number(base.number ?? base.dice ?? 0);
      const denomination = Number(base.denomination ?? base.faces ?? 0);
      if (number && denomination) formulas.push(`${number}d${denomination}`);
    }

    const parts = system.damage?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (Array.isArray(part)) formulas.push(part[0]);
        else if (part?.formula) formulas.push(part.formula);
      }
    }

    for (const activity of item?.system?.activities?.contents ?? item?.system?.activities ?? []) {
      const damage = activity?.damage ?? activity?.system?.damage;
      if (!damage) continue;
      if (damage.base?.custom?.enabled && damage.base?.custom?.formula) formulas.push(damage.base.custom.formula);
      if (damage.base?.number && damage.base?.denomination) formulas.push(`${damage.base.number}d${damage.base.denomination}`);
      if (Array.isArray(damage.parts)) {
        for (const part of damage.parts) {
          if (Array.isArray(part)) formulas.push(part[0]);
          else if (part?.formula) formulas.push(part.formula);
        }
      }
    }

    return formulas.filter(Boolean);
  }

  function logDebug(...args) {
    try {
      if (game?.settings?.get?.(MODULE_ID, "debug")) console.log(`${MODULE_TITLE} |`, ...args);
    } catch (_err) {}
  }
})();
