/*
 * Automated Features Helper — Silver Tongue integration
 * Automates Eloquence Bard: Silver Tongue / Златоуст.
 */

(() => {
  "use strict";

  const MODULE_ID = "automated-features-helper";
  const MODULE_TITLE = "Automated Features Helper";
  const DEFAULT_FEATURE_NAMES = "Златоуст;Silver Tongue";
  const TARGET_SKILLS = new Set(["dec", "deception", "обман", "per", "persuasion", "убеждение"]);

  let activeSkillContext = null;
  const originalActorRollSkill = new WeakMap();
  let originalD20BuildConfigure = null;
  let originalD20Evaluate = null;
  let originalD20EvaluateSync = null;
  let originalD20ToMessage = null;

  Hooks.once("init", () => {
    registerSilverTongueSettings();
  });

  Hooks.once("ready", () => {
    patchActorRollSkill();
    patchD20RollBuildConfigure();
    patchD20RollEvaluate();
    patchD20RollEvaluateSync();
    patchD20RollToMessage();
    debug("Silver Tongue integration ready.");
  });

  // Main reliable fallback for dnd5e v5.3 skill checks. This runs before the chat
  // message is saved and can rewrite the serialized roll data directly.
  Hooks.on("preCreateChatMessage", (message, data, options, userId) => {
    try {
      applySilverTongueToChatMessageDocument(message, "preCreateChatMessage");
    } catch (error) {
      debug("Silver Tongue preCreateChatMessage error", error);
    }
  });

  // Extra fallback for messages whose roll data is populated after preCreate.
  Hooks.on("createChatMessage", async (message) => {
    try {
      if (message?.flags?.[MODULE_ID]?.silverTongue?.applied) return;
      const update = buildSilverTongueMessageUpdate(message, "createChatMessage");
      if (update) await message.update(update);
    } catch (error) {
      debug("Silver Tongue createChatMessage error", error);
    }
  });

  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!setting("silverTongueShowChatNote")) return;
    const info = message?.flags?.[MODULE_ID]?.silverTongue;
    if (!info?.applied) return;

    const note = document.createElement("div");
    note.className = "afh-chat-note afh-silver-tongue-note csh-chat-note csh-silver-tongue-note";
    note.textContent = game.i18n.format("CSH.SilverTongue.ChatNote", { original: info.original });

    const root = html instanceof HTMLElement ? html : html?.[0] ?? html;
    const target = root?.querySelector?.(".message-content") ?? root;
    target?.append?.(note);
  });

  function registerSilverTongueSettings() {
    game.settings.register(MODULE_ID, "enableSilverTongue", {
      name: "CSH.Settings.EnableSilverTongue.Name",
      hint: "CSH.Settings.EnableSilverTongue.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, "silverTongueRequireFeature", {
      name: "CSH.Settings.SilverTongueRequireFeature.Name",
      hint: "CSH.Settings.SilverTongueRequireFeature.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, "silverTongueFeatureNames", {
      name: "CSH.Settings.SilverTongueFeatureNames.Name",
      hint: "CSH.Settings.SilverTongueFeatureNames.Hint",
      scope: "world",
      config: true,
      type: String,
      default: DEFAULT_FEATURE_NAMES
    });

    game.settings.register(MODULE_ID, "silverTongueShowChatNote", {
      name: "CSH.Settings.SilverTongueShowChatNote.Name",
      hint: "CSH.Settings.SilverTongueShowChatNote.Hint",
      scope: "client",
      config: true,
      type: Boolean,
      default: true
    });
  }

  function patchActorRollSkill() {
    const prototypes = new Set();
    if (CONFIG?.Actor?.documentClass?.prototype) prototypes.add(CONFIG.Actor.documentClass.prototype);
    if (game?.dnd5e?.documents?.Actor5e?.prototype) prototypes.add(game.dnd5e.documents.Actor5e.prototype);
    if (globalThis.Actor?.prototype) prototypes.add(globalThis.Actor.prototype);

    for (const proto of prototypes) {
      if (!proto?.rollSkill || originalActorRollSkill.has(proto)) continue;
      const original = proto.rollSkill;
      originalActorRollSkill.set(proto, original);

      proto.rollSkill = function automatedFeaturesSilverTongueRollSkill(skillId, ...args) {
        const previous = activeSkillContext;
        activeSkillContext = buildSkillContext(this, skillId, args);
        debug("Silver Tongue rollSkill context", activeSkillContext);

        let result;
        try {
          result = original.call(this, skillId, ...args);
        } catch (err) {
          activeSkillContext = previous;
          throw err;
        }

        if (isPromiseLike(result)) {
          return result.finally(() => {
            activeSkillContext = previous;
          });
        }
        activeSkillContext = previous;
        return result;
      };

      proto.rollSkill._automatedFeaturesSilverTonguePatched = true;
      debug("Patched Actor.rollSkill for Silver Tongue.");
    }
  }

  function patchD20RollBuildConfigure() {
    const D20Roll = CONFIG?.Dice?.D20Roll;
    if (!D20Roll?.buildConfigure || D20Roll.buildConfigure._automatedFeaturesSilverTonguePatched) return;
    originalD20BuildConfigure = D20Roll.buildConfigure;

    D20Roll.buildConfigure = async function automatedFeaturesSilverTongueBuildConfigure(config = {}, dialog = {}, message = {}) {
      markConfigIfEligible(config);
      const result = await originalD20BuildConfigure.call(this, config, dialog, message);
      markConfigIfEligible(result);
      return result;
    };

    D20Roll.buildConfigure._automatedFeaturesSilverTonguePatched = true;
    debug("Patched CONFIG.Dice.D20Roll.buildConfigure for Silver Tongue.");
  }

  function patchD20RollEvaluate() {
    const D20Roll = CONFIG?.Dice?.D20Roll;
    if (!D20Roll?.prototype?.evaluate || D20Roll.prototype.evaluate._automatedFeaturesSilverTonguePatched) return;
    originalD20Evaluate = D20Roll.prototype.evaluate;

    D20Roll.prototype.evaluate = async function automatedFeaturesSilverTongueEvaluate(...args) {
      const result = await originalD20Evaluate.apply(this, args);
      applySilverTongueToRollObject(this, null, "D20Roll.evaluate");
      return result;
    };
    D20Roll.prototype.evaluate._automatedFeaturesSilverTonguePatched = true;
    debug("Patched CONFIG.Dice.D20Roll.prototype.evaluate for Silver Tongue.");
  }

  function patchD20RollEvaluateSync() {
    const D20Roll = CONFIG?.Dice?.D20Roll;
    if (!D20Roll?.prototype?.evaluateSync || D20Roll.prototype.evaluateSync._automatedFeaturesSilverTonguePatched) return;
    originalD20EvaluateSync = D20Roll.prototype.evaluateSync;

    D20Roll.prototype.evaluateSync = function automatedFeaturesSilverTongueEvaluateSync(...args) {
      const result = originalD20EvaluateSync.apply(this, args);
      applySilverTongueToRollObject(this, null, "D20Roll.evaluateSync");
      return result;
    };
    D20Roll.prototype.evaluateSync._automatedFeaturesSilverTonguePatched = true;
    debug("Patched CONFIG.Dice.D20Roll.prototype.evaluateSync for Silver Tongue.");
  }

  function patchD20RollToMessage() {
    const D20Roll = CONFIG?.Dice?.D20Roll;
    if (!D20Roll?.prototype?.toMessage || D20Roll.prototype.toMessage._automatedFeaturesSilverTonguePatched) return;
    originalD20ToMessage = D20Roll.prototype.toMessage;

    D20Roll.prototype.toMessage = function automatedFeaturesSilverTongueToMessage(...args) {
      applySilverTongueToRollObject(this, null, "D20Roll.toMessage");
      return originalD20ToMessage.apply(this, args);
    };
    D20Roll.prototype.toMessage._automatedFeaturesSilverTonguePatched = true;
    debug("Patched CONFIG.Dice.D20Roll.prototype.toMessage for Silver Tongue.");
  }

  function markConfigIfEligible(config) {
    if (!config || !setting("enableSilverTongue")) return config;
    const context = resolveContextFromConfig(config);
    if (!context?.eligible) {
      debug("Silver Tongue D20 config skipped", context?.reason ?? "no eligible context", config);
      return config;
    }

    config.options ??= {};
    config.options[MODULE_ID] ??= {};
    config.options[MODULE_ID].silverTongue = buildMetadata(context, "D20Roll.buildConfigure");

    config.message ??= {};
    config.message.flags ??= {};
    config.message.flags[MODULE_ID] ??= {};
    config.message.flags[MODULE_ID].silverTongueCandidate = true;

    debug("Marked D20 config for Silver Tongue", config.options[MODULE_ID].silverTongue);
    return config;
  }

  function applySilverTongueToChatMessageDocument(message, source) {
    const update = buildSilverTongueMessageUpdate(message, source);
    if (!update) return false;
    message.updateSource(update);
    return true;
  }

  function buildSilverTongueMessageUpdate(message, source) {
    if (!setting("enableSilverTongue")) return null;

    const messageData = message?.toObject?.() ?? message?._source ?? message ?? {};
    if (messageData?.flags?.[MODULE_ID]?.silverTongue?.applied) return null;

    const context = inferContextFromMessage(message, messageData);
    if (!context?.eligible) {
      debug("Silver Tongue message skipped", context?.reason ?? "not eligible", {
        source,
        flavor: messageData?.flavor ?? message?.flavor,
        speaker: messageData?.speaker ?? message?.speaker,
        flags: messageData?.flags ?? message?.flags
      });
      return null;
    }

    const sourceRolls = getMessageRollData(message, messageData);
    if (!sourceRolls.length) {
      debug("Silver Tongue message skipped: no rolls", { source, messageData });
      return null;
    }

    const newRolls = [];
    let appliedInfo = null;

    for (const raw of sourceRolls) {
      const rollData = cloneRollData(raw);
      const info = applySilverTongueToSerializedRoll(rollData, context, source);
      newRolls.push(rollData);
      if (info?.applied && !appliedInfo) appliedInfo = info;
    }

    if (!appliedInfo) return null;

    debug("Silver Tongue message update built", { source, appliedInfo, newRolls });
    return {
      rolls: newRolls,
      [`flags.${MODULE_ID}.silverTongue`]: appliedInfo
    };
  }

  function getMessageRollData(message, messageData) {
    const rolls = [];
    if (Array.isArray(messageData?.rolls)) rolls.push(...messageData.rolls);
    else if (Array.isArray(message?.rolls)) rolls.push(...message.rolls);
    else if (messageData?.roll) rolls.push(messageData.roll);
    else if (message?.roll) rolls.push(message.roll);
    return rolls;
  }

  function cloneRollData(raw) {
    if (raw instanceof Roll) return raw.toJSON();
    return foundry?.utils?.deepClone ? foundry.utils.deepClone(raw) : JSON.parse(JSON.stringify(raw));
  }

  function applySilverTongueToRollObject(roll, context = null, source = "roll") {
    if (!roll || !setting("enableSilverTongue")) return false;
    const metadata = roll.options?.[MODULE_ID]?.silverTongue;
    if (!metadata && !activeSkillContext?.eligible) return false;

    const rollData = roll.toJSON?.() ?? roll;
    const info = applySilverTongueToSerializedRoll(rollData, context ?? activeSkillContext, source);
    if (!info?.applied) return false;

    try {
      const replaced = Roll.fromData(rollData);
      roll.terms = replaced.terms;
      roll._total = replaced.total;
      roll.options ??= {};
      roll.options[MODULE_ID] ??= {};
      roll.options[MODULE_ID].silverTongue = info;
    } catch (_err) {
      roll._total = Number(roll._total ?? roll.total ?? 0) + info.delta;
    }
    return true;
  }

  function applySilverTongueToSerializedRoll(rollData, context, source) {
    if (!rollData || !setting("enableSilverTongue")) return null;
    const existing = rollData?.options?.[MODULE_ID]?.silverTongue ?? rollData?.flags?.[MODULE_ID]?.silverTongue;
    if (existing?.applied) return existing;

    const die = findD20TermData(rollData);
    if (!die) {
      debug("Silver Tongue skipped: serialized roll has no d20", { source, rollData });
      return null;
    }

    const selected = getSelectedD20Result(die);
    normalizeResultField(selected);
    if (!selected || typeof selected.result !== "number") {
      debug("Silver Tongue skipped: no selected d20 result", { source, die });
      return null;
    }

    const original = Number(selected.result);
    if (original < 1 || original > 9) {
      debug("Silver Tongue not needed", { source, original });
      return null;
    }

    const delta = 10 - original;
    selected.result = 10;
    if ("count" in selected) selected.count = 10;
    if ("number" in selected) selected.number = 10;
    if ("value" in selected) selected.value = 10;

    bumpTotals(die, delta);
    bumpTotals(rollData, delta);

    rollData.options ??= {};
    rollData.options[MODULE_ID] ??= {};

    const info = {
      ...buildMetadata(context, source),
      applied: true,
      original,
      adjusted: 10,
      delta,
      source
    };

    rollData.options[MODULE_ID].silverTongue = info;
    rollData.flags ??= {};
    rollData.flags[MODULE_ID] ??= {};
    rollData.flags[MODULE_ID].silverTongue = info;

    debug(`Applied Silver Tongue: d20 ${original} -> 10 (+${delta}).`, { source, info, rollData });
    return info;
  }

  function bumpTotals(obj, delta) {
    if (!obj || typeof obj !== "object") return;
    for (const key of ["total", "_total", "result", "_result"]) {
      if (typeof obj[key] === "number") obj[key] += delta;
    }
  }

  function findD20TermData(rollData) {
    const seen = new Set();

    const visit = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 10 || seen.has(value)) return null;
      seen.add(value);

      if (Array.isArray(value.results)) {
        const faces = Number(value.faces ?? value.numberFaces ?? value.denomination ?? value.options?.faces ?? 0);
        const looksLikeD20 = faces === 20 || value.results.some((r) => Number(r?.result ?? r?.number ?? r?.value ?? 0) >= 1 && Number(r?.result ?? r?.number ?? r?.value ?? 0) <= 20);
        if (looksLikeD20) return value;
      }

      const terms = Array.isArray(value.terms) ? value.terms : null;
      if (terms) {
        for (const term of terms) {
          const found = visit(term, depth + 1);
          if (found) return found;
        }
      }

      for (const child of Object.values(value)) {
        const found = visit(child, depth + 1);
        if (found) return found;
      }
      return null;
    };

    return visit(rollData);
  }

  function normalizeResultField(result) {
    if (!result || typeof result !== "object") return;
    if (typeof result.result !== "number") {
      for (const key of ["number", "value", "roll"]) {
        if (typeof result[key] === "number") {
          result.result = result[key];
          return;
        }
      }
    }
  }

  function getSelectedD20Result(die) {
    const results = die.results ?? [];
    const active = results.filter((result) => result.active !== false && !result.discarded && !result.rerolled && !result.exploded && !result.hidden);
    if (active.length) return active[active.length - 1];
    return results.find((result) => result.active !== false && !result.discarded) ?? results[results.length - 1];
  }

  function buildSkillContext(actor, skillId, args) {
    const extractedSkill = extractSkillId(skillId) ?? skillId;
    const normalizedSkill = normalizeSkillId(extractedSkill);
    return {
      actor,
      skillId: normalizedSkill,
      rawSkillId: skillId,
      extractedSkillId: extractedSkill,
      eligible: setting("enableSilverTongue") && isEligibleSkill(normalizedSkill) && actorHasSilverTongue(actor),
      reason: getIneligibilityReason(actor, normalizedSkill),
      args
    };
  }

  function resolveContextFromConfig(config) {
    if (activeSkillContext) return activeSkillContext;
    const speakerActor = getActorFromSpeaker(config?.message?.speaker ?? config?.speaker);
    const possibleSkill = extractSkillId(config);
    if (!possibleSkill) return { eligible: false, reason: "no active rollSkill context and no skill id in config" };
    const normalizedSkill = normalizeSkillId(possibleSkill);
    return {
      actor: speakerActor,
      skillId: normalizedSkill,
      rawSkillId: possibleSkill,
      eligible: setting("enableSilverTongue") && isEligibleSkill(normalizedSkill) && actorHasSilverTongue(speakerActor),
      reason: getIneligibilityReason(speakerActor, normalizedSkill)
    };
  }

  function inferContextFromMessage(message, messageData) {
    if (activeSkillContext?.eligible) return activeSkillContext;
    if (!setting("enableSilverTongue")) return { eligible: false, reason: "Silver Tongue disabled" };

    const actor = getActorFromSpeaker(messageData?.speaker ?? message?.speaker);
    if (!actor) return { eligible: false, reason: "no actor in message speaker" };

    const skillId = extractSkillId(messageData) ?? findSkillInText([
      messageData?.flavor,
      message?.flavor,
      messageData?.content,
      message?.content,
      messageData?.flags,
      message?.flags,
      messageData?.type,
      message?.type
    ]);

    const normalizedSkill = normalizeSkillId(skillId);
    return {
      actor,
      skillId: normalizedSkill,
      rawSkillId: skillId,
      eligible: setting("enableSilverTongue") && isEligibleSkill(normalizedSkill) && actorHasSilverTongue(actor),
      reason: getIneligibilityReason(actor, normalizedSkill)
    };
  }

  function getIneligibilityReason(actor, skillId) {
    if (!setting("enableSilverTongue")) return "Silver Tongue disabled";
    if (!isEligibleSkill(skillId)) return `skill ${skillId} is not Deception/Persuasion`;
    if (!actorHasSilverTongue(actor)) return "actor does not have Silver Tongue feature";
    return null;
  }

  function actorHasSilverTongue(actor) {
    if (!actor) return false;
    if (!setting("silverTongueRequireFeature")) return true;

    const accepted = String(setting("silverTongueFeatureNames") ?? DEFAULT_FEATURE_NAMES)
      .split(";")
      .map((name) => normalizeName(name))
      .filter(Boolean);
    if (!accepted.length) return false;

    return Array.from(actor.items ?? []).some((item) => {
      const name = normalizeName(item?.name);
      if (accepted.includes(name)) return true;
      const description = normalizeName(item?.system?.description?.value);
      return accepted.some((marker) => marker && description.includes(marker));
    });
  }

  function extractSkillId(value) {
    const found = findSkillInObject(value);
    if (found && typeof found === "object") return findSkillInObject(found);
    return found;
  }

  function findSkillInObject(value, depth = 0) {
    if (depth > 6 || value == null) return null;
    if (typeof value === "string" && isEligibleSkill(value)) return value;
    if (typeof value !== "object") return null;

    for (const key of ["skill", "skillId", "skillID", "skillKey", "id", "key", "identifier", "abilityId", "name", "label", "slug", "value"]) {
      if (isEligibleSkill(value[key])) return value[key];
    }

    // dnd5e v5.3 may pass a full skill object instead of a string.
    // Russian systems/sheets often keep the display label rather than the id.
    for (const key of ["title", "localized", "localizedName", "display", "displayName"]) {
      if (isEligibleSkill(value[key])) return value[key];
    }

    for (const child of Object.values(value)) {
      const found = findSkillInObject(child, depth + 1);
      if (found) return found;
    }
    return null;
  }

  function findSkillInText(values) {
    const text = values.map((value) => {
      try { return typeof value === "string" ? value : JSON.stringify(value ?? ""); }
      catch (_err) { return ""; }
    }).join(" ").toLowerCase().replace(/[ё]/g, "е");

    if (/\bdec(eption)?\b/.test(text) || text.includes("обман") || text.includes("deception")) return "dec";
    if (/\bper(suasion)?\b/.test(text) || text.includes("убеждение") || text.includes("persuasion")) return "per";
    return null;
  }

  function getActorFromSpeaker(speaker) {
    if (!speaker) return null;
    if (speaker.actor) return game.actors?.get(speaker.actor) ?? null;
    if (speaker.token) {
      const tokenId = typeof speaker.token === "string" ? speaker.token : speaker.token?.id;
      const token = canvas?.tokens?.get?.(tokenId) ?? canvas?.tokens?.placeables?.find?.((t) => t.id === tokenId || t.document?.id === tokenId);
      return token?.actor ?? token?.document?.actor ?? null;
    }
    return null;
  }

  function buildMetadata(context, source) {
    return {
      actorUuid: context?.actor?.uuid,
      actorName: context?.actor?.name,
      skillId: context?.skillId,
      source
    };
  }

  function normalizeSkillId(skillId) {
    return String(skillId ?? "").trim().toLowerCase();
  }

  function isEligibleSkill(skillId) {
    return TARGET_SKILLS.has(normalizeSkillId(skillId));
  }

  function normalizeName(value) {
    return String(value ?? "").trim().toLowerCase().replace(/[ё]/g, "е");
  }

  function setting(key) {
    try { return game.settings.get(MODULE_ID, key); }
    catch (_err) { return undefined; }
  }

  function isPromiseLike(value) {
    return value && typeof value.then === "function";
  }

  function debug(...args) {
    try {
      if (game?.settings?.get?.(MODULE_ID, "debug")) console.log(`${MODULE_TITLE} |`, ...args);
    } catch (_err) {}
  }
})();
