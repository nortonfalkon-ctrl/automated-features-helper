/*
 * Automated Features Helper — Corruption Charges / Порча.
 *
 * Adds 1 charge to the configured counter item whenever an actor spends a
 * spell slot of 1st level or higher. Implemented by watching actor spell-slot
 * values decrease, which is the most reliable common point after dnd5e consumes
 * a slot for a spell cast.
 */

(() => {
  "use strict";

  const MODULE_ID = "automated-features-helper";
  const MODULE_TITLE = "Automated Features Helper";
  const SLOT_KEYS = ["spell1", "spell2", "spell3", "spell4", "spell5", "spell6", "spell7", "spell8", "spell9"];
  const RESTORE_DEBOUNCE_MS = 250;

  Hooks.once("init", () => {
    registerSettings();
  });

  Hooks.once("ready", () => {
    console.log(`${MODULE_TITLE} | Corruption Charges integration ready.`);
  });

  Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
    try {
      if (!game.settings.get(MODULE_ID, "enableCorruptionCharges")) return;
      if (userId && userId !== game.user?.id) return;
      if (!actor || !changes) return;

      const spent = getSpentSpellSlots(actor, changes);
      if (spent.total <= 0) return;

      const actorUuid = actor.uuid;
      const actorName = actor.name;
      logDebug("Detected spent spell slot(s) for Corruption.", { actor: actorName, spent, changes });

      // Wait until the actor slot update is committed, then update the embedded counter item.
      setTimeout(() => addCorruptionCharges(actorUuid, spent.total, spent), 0);
    } catch (err) {
      console.warn(`${MODULE_TITLE} | Corruption charge detection failed.`, err);
    }
  });


  Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
    try {
      if (!game.settings.get(MODULE_ID, "enableCorruptionCharges")) return;
      if (userId && userId !== game.user?.id) return;
      if (!actor || !changes) return;

      const restored = getRestoredSpellSlots(actor, changes);
      if (restored.total <= 0) return;

      logDebug("Detected restored spell slot(s); scheduling Corruption long-rest reset.", { actor: actor.name, restored, changes, options });
      scheduleCorruptionReset(actor.uuid, "spell-slot-restoration", restored);
    } catch (err) {
      console.warn(`${MODULE_TITLE} | Corruption long-rest reset detection failed.`, err);
    }
  });

  Hooks.on("dnd5e.restCompleted", (...args) => {
    handlePossibleRestHook("dnd5e.restCompleted", args);
  });

  Hooks.on("dnd5e.longRest", (...args) => {
    handlePossibleRestHook("dnd5e.longRest", args, true);
  });

  Hooks.on("restCompleted", (...args) => {
    handlePossibleRestHook("restCompleted", args);
  });

  function registerSettings() {
    game.settings.register(MODULE_ID, "enableCorruptionCharges", {
      name: "CSH.Settings.EnableCorruptionCharges.Name",
      hint: "CSH.Settings.EnableCorruptionCharges.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, "corruptionCounterNames", {
      name: "CSH.Settings.CorruptionCounterNames.Name",
      hint: "CSH.Settings.CorruptionCounterNames.Hint",
      scope: "world",
      config: true,
      type: String,
      default: "Порча;Corruption"
    });

    game.settings.register(MODULE_ID, "corruptionShowChatNote", {
      name: "CSH.Settings.CorruptionShowChatNote.Name",
      hint: "CSH.Settings.CorruptionShowChatNote.Hint",
      scope: "client",
      config: true,
      type: Boolean,
      default: true
    });
  }

  function getSpentSpellSlots(actor, changes) {
    const levels = [];
    let total = 0;

    for (let level = 1; level <= 9; level++) {
      const key = SLOT_KEYS[level - 1];
      const path = `system.spells.${key}.value`;
      if (!hasProperty(changes, path)) continue;

      const oldValue = Number(foundry.utils.getProperty(actor, path) ?? 0);
      const newValue = Number(foundry.utils.getProperty(changes, path) ?? oldValue);
      if (!Number.isFinite(oldValue) || !Number.isFinite(newValue)) continue;

      const delta = oldValue - newValue;
      if (delta <= 0) continue;

      levels.push({ level, oldValue, newValue, spent: delta });
      total += delta;
    }

    return { total, levels };
  }


  function getRestoredSpellSlots(actor, changes) {
    const levels = [];
    let total = 0;

    for (let level = 1; level <= 9; level++) {
      const key = SLOT_KEYS[level - 1];
      const path = `system.spells.${key}.value`;
      if (!hasProperty(changes, path)) continue;

      const oldValue = Number(foundry.utils.getProperty(actor, path) ?? 0);
      const newValue = Number(foundry.utils.getProperty(changes, path) ?? oldValue);
      if (!Number.isFinite(oldValue) || !Number.isFinite(newValue)) continue;

      const delta = newValue - oldValue;
      if (delta <= 0) continue;

      levels.push({ level, oldValue, newValue, restored: delta });
      total += delta;
    }

    return { total, levels };
  }

  function scheduleCorruptionReset(actorUuid, reason, data) {
    if (!actorUuid) return;
    setTimeout(() => resetCorruptionAfterLongRest(actorUuid, reason, data), RESTORE_DEBOUNCE_MS);
  }

  function handlePossibleRestHook(source, args, forceLongRest = false) {
    try {
      if (!game.settings.get(MODULE_ID, "enableCorruptionCharges")) return;

      const actor = extractActorFromArgs(args);
      if (!actor) return;

      const restData = args.find(arg => arg && typeof arg === "object" && !arg.items && !arg.system && !arg.documentName) ?? {};
      const isLong = forceLongRest || restData?.longRest === true || restData?.isLongRest === true || restData?.type === "long" || restData?.restType === "long";
      if (!isLong) return;

      logDebug("Detected rest hook; scheduling Corruption reset.", { source, actor: actor.name, restData, args });
      scheduleCorruptionReset(actor.uuid, source, restData);
    } catch (err) {
      console.warn(`${MODULE_TITLE} | Corruption rest hook failed.`, err);
    }
  }

  function extractActorFromArgs(args) {
    for (const arg of args) {
      if (!arg) continue;
      if (arg.documentName === "Actor" || arg.constructor?.name?.includes?.("Actor")) return arg;
      if (arg.actor) return arg.actor;
      if (arg.document?.documentName === "Actor") return arg.document;
    }
    return null;
  }

  async function resetCorruptionAfterLongRest(actorUuid, reason, data) {
    try {
      const actor = await fromUuid(actorUuid);
      if (!actor) return;

      const counter = findCorruptionCounter(actor);
      if (!counter) {
        logDebug("Corruption rest reset skipped: counter not found.", { actor: actor.name, reason, data });
        return;
      }

      const baseMax = getCorruptionBaseMax(actor, counter);
      if (!Number.isFinite(baseMax)) {
        logDebugText("Corruption rest reset skipped: could not compute base max", {
          actor: actor.name,
          item: counter.name,
          reason,
          data,
          counter: describeCounterState(counter, actor, "reset-skipped")
        });
        return;
      }

      const safeMax = Math.max(0, Math.floor(baseMax));
      const before = describeCounterState(counter, actor, "rest-before");
      const update = {
        "system.uses.max": safeMax,
        "system.uses.value": safeMax,
        "system.uses.spent": 0
      };

      logDebugText("Corruption long-rest reset before", { reason, data, before, baseMax: safeMax, update });
      await counter.update(update);

      const refreshedActor = await fromUuid(actorUuid);
      const refreshedCounter = refreshedActor?.items?.get?.(counter.id) ?? findCorruptionCounter(refreshedActor ?? actor);
      const after = describeCounterState(refreshedCounter ?? counter, refreshedActor ?? actor, "rest-after");
      logDebugText("Corruption long-rest reset after", after);
    } catch (err) {
      console.warn(`${MODULE_TITLE} | Failed to reset Corruption after long rest.`, err);
    }
  }

  function getCorruptionBaseMax(actor, counter) {
    const classLevel = getPraetorLevel(actor);
    if (Number.isFinite(classLevel) && classLevel > 0) return Math.floor(classLevel / 2);

    const flagValue = Number(counter?.getFlag?.(MODULE_ID, "corruptionBaseMax"));
    if (Number.isFinite(flagValue)) return flagValue;

    const currentMax = Number(counter?.system?.uses?.max ?? counter?.system?.uses?.maximum);
    if (Number.isFinite(currentMax)) return currentMax;

    return null;
  }

  function getPraetorLevel(actor) {
    const classes = actor?.system?.classes ?? {};
    for (const [key, cls] of Object.entries(classes)) {
      const normalizedKey = normalizeName(key);
      const normalizedLabel = normalizeName(cls?.label ?? cls?.name ?? cls?.identifier ?? "");
      if (normalizedKey === "praetor" || normalizedKey === "претор" || normalizedLabel === "praetor" || normalizedLabel === "претор") {
        const levels = Number(cls?.levels ?? cls?.level ?? cls?.value ?? 0);
        if (Number.isFinite(levels)) return levels;
      }
    }

    const classItem = Array.from(actor?.items ?? []).find(item => {
      if (String(item?.type ?? "").toLocaleLowerCase() !== "class") return false;
      const name = normalizeName(item?.name);
      const identifier = normalizeName(item?.system?.identifier ?? item?.system?.slug ?? "");
      return name === "претор" || name === "praetor" || identifier === "praetor" || identifier === "претор";
    });

    const itemLevel = Number(classItem?.system?.levels ?? classItem?.system?.level ?? 0);
    return Number.isFinite(itemLevel) ? itemLevel : null;
  }

  function hasProperty(object, path) {
    if (foundry.utils.hasProperty) return foundry.utils.hasProperty(object, path);
    return foundry.utils.getProperty(object, path) !== undefined;
  }

  async function addCorruptionCharges(actorUuid, amount, spentInfo) {
    try {
      const actor = await fromUuid(actorUuid);
      if (!actor) {
        logDebug("Corruption skipped: actor not found after slot spend.", { actorUuid, amount, spentInfo });
        return;
      }

      const counter = findCorruptionCounter(actor);
      if (!counter) {
        logDebug("Corruption skipped: counter item not found.", { actor: actor.name, names: getCounterNames() });
        return;
      }

      const before = describeCounterState(counter, actor, "before");
      const baseMax = getCorruptionBaseMax(actor, counter);
      if (Number.isFinite(baseMax)) await counter.setFlag(MODULE_ID, "corruptionBaseMax", Math.max(0, Math.floor(baseMax)));

      const update = buildChargeUpdate(counter, amount);
      if (!update) {
        console.warn(`${MODULE_TITLE} | Could not update Corruption counter ${counter.name}: unsupported uses data.`, counter.system?.uses);
        logDebugText("Corruption diagnostic unsupported counter data", { before, spentInfo });
        return;
      }

      logDebugText("Corruption counter before update", before);
      logDebugText("Corruption update payload", { itemId: counter.id, itemUuid: counter.uuid, amount, update, spentInfo });

      await counter.update(update);

      const refreshedActor = await fromUuid(actorUuid);
      const refreshedCounter = refreshedActor?.items?.get?.(counter.id) ?? findCorruptionCounter(refreshedActor ?? actor);
      const after = describeCounterState(refreshedCounter ?? counter, refreshedActor ?? actor, "after");
      logDebugText("Corruption counter after update", after);
      logDebug(`Added ${amount} Corruption charge(s) to ${actor.name}.`, { item: counter.name, update, spentInfo });

      if (game.settings.get(MODULE_ID, "corruptionShowChatNote")) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: game.i18n.format("CSH.Corruption.ChatNote", {
            actor: actor.name,
            item: counter.name,
            amount
          })
        });
      }
    } catch (err) {
      console.warn(`${MODULE_TITLE} | Failed to add Corruption charge.`, err);
    }
  }

  function findCorruptionCounter(actor) {
    const names = getCounterNames();
    const items = Array.from(actor?.items ?? []).filter(isCorruptionFeatureCandidate);

    let found = items.find(item => names.includes(normalizeName(item?.name)));
    if (found) return found;

    // Fallback: allow partial match, but only among non-spell feature-like items.
    found = items.find(item => {
      const name = normalizeName(item?.name);
      return names.some(marker => marker && name.includes(marker));
    });
    return found ?? null;
  }

  function isCorruptionFeatureCandidate(item) {
    if (!item) return false;

    // The class feature and the spell can have the same displayed name.
    // Never use spells as the Corruption counter; only feature-like items may count.
    const type = String(item.type ?? "").toLocaleLowerCase();
    if (type === "spell") return false;

    if (type === "feat") return true;

    const itemType = normalizeName(item.system?.type?.value ?? item.system?.type ?? "");
    if (["class", "subclass", "feature", "особенность", "классовая", "классовая особенность"].includes(itemType)) return true;

    // Keep a narrow fallback for imported homebrew counters that store uses but use a custom type.
    return item.system?.uses !== undefined && type !== "spell";
  }

  function getCounterNames() {
    const configured = String(game.settings.get(MODULE_ID, "corruptionCounterNames") ?? "Порча;Corruption");
    return configured
      .split(/[;\n,]/g)
      .map(normalizeName)
      .filter(Boolean);
  }

  function normalizeName(value) {
    return String(value ?? "")
      .trim()
      .toLocaleLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ");
  }

  function buildChargeUpdate(item, amount) {
    const uses = item?.system?.uses ?? {};

    // In dnd5e 5.3.x item uses are clamped to their max. Updating value to 2
    // while max is 1 is accepted by item.update(), but prepareData clamps it back
    // to 1. Therefore temporary Corruption charges must raise both current value
    // and current max. The normal long-rest cap remains stored in the class formula
    // on the feature; we keep diagnostics verbose until this is verified in-world.
    if (uses.value !== undefined && uses.max !== undefined) {
      const currentValue = Number(uses.value ?? 0);
      const currentMax = Number(uses.max ?? 0);
      if (!Number.isFinite(currentValue) || !Number.isFinite(currentMax)) return null;
      return {
        "system.uses.value": currentValue + amount,
        "system.uses.max": currentMax + amount
      };
    }

    if (uses.value !== undefined) {
      const current = Number(uses.value ?? 0);
      if (!Number.isFinite(current)) return null;
      return { "system.uses.value": current + amount };
    }

    // Alternate item data shape where only spent/max exist. This cannot exceed max
    // if the system clamps negative spent, but it remains a safe fallback.
    if (uses.spent !== undefined) {
      const current = Number(uses.spent ?? 0);
      if (!Number.isFinite(current)) return null;
      return { "system.uses.spent": Math.max(0, current - amount) };
    }

    return null;
  }


  function describeCounterState(item, actor, phase) {
    const uses = item?.system?.uses ?? {};
    const maxRaw = uses.max ?? uses.maximum ?? null;
    const spentRaw = uses.spent ?? null;
    const valueRaw = uses.value ?? null;
    const maxNumber = Number(maxRaw);
    const spentNumber = Number(spentRaw);
    const valueNumber = Number(valueRaw);

    let preparedMax = null;
    let preparedSpent = null;
    let preparedValue = null;
    try {
      preparedMax = item?.system?.uses?.max ?? item?.system?.uses?.maximum ?? null;
      preparedSpent = item?.system?.uses?.spent ?? null;
      preparedValue = item?.system?.uses?.value ?? null;
    } catch (_err) {}

    return {
      phase,
      actor: actor?.name ?? null,
      actorId: actor?.id ?? null,
      item: item?.name ?? null,
      itemId: item?.id ?? null,
      itemUuid: item?.uuid ?? null,
      itemType: item?.type ?? null,
      systemType: item?.system?.type ?? null,
      usesRaw: duplicateSafe(uses),
      numeric: {
        max: Number.isFinite(maxNumber) ? maxNumber : String(maxRaw ?? ""),
        spent: Number.isFinite(spentNumber) ? spentNumber : String(spentRaw ?? ""),
        value: Number.isFinite(valueNumber) ? valueNumber : String(valueRaw ?? "")
      },
      prepared: {
        max: preparedMax,
        spent: preparedSpent,
        value: preparedValue
      }
    };
  }

  function duplicateSafe(value) {
    try {
      if (foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
      return JSON.parse(JSON.stringify(value ?? null));
    } catch (_err) {
      return String(value ?? "");
    }
  }

  function logDebugText(label, data) {
    try {
      if (!game?.settings?.get?.(MODULE_ID, "debug")) return;
      console.log(`${MODULE_TITLE} | ${label}: ${JSON.stringify(data)}`);
    } catch (err) {
      console.log(`${MODULE_TITLE} | ${label}:`, data, err);
    }
  }

  function logDebug(...args) {
    try {
      if (game?.settings?.get?.(MODULE_ID, "debug")) console.log(`${MODULE_TITLE} |`, ...args);
    } catch (_err) {}
  }
})();
