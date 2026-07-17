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
  let originalD20BuildConfigure = null;
  let originalD20Evaluate = null;
  let originalD20EvaluateSync = null;
  let originalD20ToMessage = null;
  let originalChatMessageCreate = null;
  const originalActorRollSkill = new WeakMap();

  Hooks.once("init", () => {
    registerSilverTongueSettings();
  });

  Hooks.once("ready", () => {
    patchActorRollSkill();
    patchD20RollBuildConfigure();
    patchD20RollEvaluate();
    patchD20RollEvaluateSync();
    patchD20RollToMessage();
    patchChatMessageCreate();
    debug(`Silver Tongue integration ready.`);
  });

  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!setting("silverTongueShowChatNote")) return;
    const info = message?.flags?.[MODULE_ID]?.silverTongue;
    if (!info?.applied) return;

    const note = document.createElement("div");
    note.className = "csh-chat-note csh-silver-tongue-note";
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

      proto.rollSkill = function combatStyleHelperSilverTongueRollSkill(skillId, ...args) {
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

      proto.rollSkill._combatStyleHelperSilverTonguePatched = true;
      debug("Patched Actor.rollSkill for Silver Tongue.");
    }
  }

  function patchD20RollBuildConfigure() {
    const D20Roll = CONFIG?.Dice?.D20Roll;
    if (!D20Roll?.buildConfigure || D20Roll.buildConfigure._combatStyleHelperSilverTonguePatched) return;

    originalD20BuildConfigure = D20Roll.buildConfigure;

    D20Roll.buildConfigure = async function combatStyleHelperSilverTongueBuildConfigure(config = {}, dialog = {}, message = {}) {
      markConfigIfEligible(config);
      const result = await originalD20BuildConfigure.call(this, config, dialog, message);
      markConfigIfEligible(result);
      return result;
    };

    D20Roll.buildConfigure._combatStyleHelperSilverTonguePatched = true;
    debug("Patched CONFIG.Dice.D20Roll.buildConfigure for Silver Tongue.");
  }

  function patchD20RollEvaluate() {
    const D20Roll = CONFIG?.Dice?.D20Roll;
    if (!D20Roll?.prototype?.evaluate || D20Roll.prototype.evaluate._combatStyleHelperSilverTonguePatched) return;

    originalD20Evaluate = D20Roll.prototype.evaluate;

    D20Roll.prototype.evaluate = async function combatStyleHelperSilverTongueEvaluate(...args) {
      const result = await originalD20Evaluate.apply(this, args);
      applySilverTongue(this);
      return result;
    };

    D20Roll.prototype.evaluate._combatStyleHelperSilverTonguePatched = true;
    debug("Patched CONFIG.Dice.D20Roll.prototype.evaluate for Silver Tongue.");
  }

  function patchD20RollEvaluateSync() {
    const D20Roll = CONFIG?.Dice?.D20Roll;
    if (!D20Roll?.prototype?.evaluateSync || D20Roll.prototype.evaluateSync._combatStyleHelperSilverTonguePatched) return;

    originalD20EvaluateSync = D20Roll.prototype.evaluateSync;

    D20Roll.prototype.evaluateSync = function combatStyleHelperSilverTongueEvaluateSync(...args) {
      const result = originalD20EvaluateSync.apply(this, args);
      applySilverTongue(this);
      return result;
    };

    D20Roll.prototype.evaluateSync._combatStyleHelperSilverTonguePatched = true;
    debug("Patched CONFIG.Dice.D20Roll.prototype.evaluateSync for Silver Tongue.");
  }

  function patchD20RollToMessage() {
    const D20Roll = CONFIG?.Dice?.D20Roll;
    if (!D20Roll?.prototype?.toMessage || D20Roll.prototype.toMessage._combatStyleHelperSilverTonguePatched) return;

    originalD20ToMessage = D20Roll.prototype.toMessage;

    D20Roll.prototype.toMessage = function combatStyleHelperSilverTongueToMessage(...args) {
      applySilverTongue(this);
      return originalD20ToMessage.apply(this, args);
    };

    D20Roll.prototype.toMessage._combatStyleHelperSilverTonguePatched = true;
    debug("Patched CONFIG.Dice.D20Roll.prototype.toMessage for Silver Tongue.");
  }

  function patchChatMessageCreate() {
    if (!globalThis.ChatMessage?.create || ChatMessage.create._combatStyleHelperSilverTonguePatched) return;

    originalChatMessageCreate = ChatMessage.create;

    ChatMessage.create = async function combatStyleHelperSilverTongueChatMessageCreate(data, ...args) {
      await applySilverTongueToMessageData(data);
      return originalChatMessageCreate.call(this, data, ...args);
    };

    ChatMessage.create._combatStyleHelperSilverTonguePatched = true;
    debug("Patched ChatMessage.create for Silver Tongue.");
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
    config.options[MODULE_ID].silverTongue = {
      actorUuid: context.actor?.uuid,
      actorName: context.actor?.name,
      skillId: context.skillId,
      source: "D20Roll.buildConfigure"
    };

    config.message ??= {};
    config.message.flags ??= {};
    config.message.flags[MODULE_ID] ??= {};
    config.message.flags[MODULE_ID].silverTongueCandidate = true;

    debug("Marked D20 config for Silver Tongue", config.options[MODULE_ID].silverTongue);
    return config;
  }

  async function applySilverTongueToMessageData(data) {
    if (!data || !setting("enableSilverTongue")) return;
    const rolls = Array.isArray(data.rolls) ? data.rolls : [];
    if (!rolls.length) return;

    for (let index = 0; index < rolls.length; index += 1) {
      const raw = rolls[index];
      try {
        const roll = raw instanceof Roll ? raw : Roll.fromData(raw);
        const applied = applySilverTongue(roll, { allowFallback: true, messageData: data });
        if (applied) rolls[index] = roll.toJSON();
      } catch (error) {
        debug("Could not inspect message roll for Silver Tongue", error, raw);
      }
    }
  }

  function applySilverTongue(roll, { allowFallback = false, messageData = null } = {}) {
    if (!roll || roll.options?.[MODULE_ID]?.silverTongue?.applied) return false;
    if (!setting("enableSilverTongue")) return false;

    let metadata = roll.options?.[MODULE_ID]?.silverTongue;
    if (!metadata && !allowFallback) return false;
    if (!metadata && allowFallback) {
      if (!isFallbackEligible(messageData)) return false;
      const inferred = inferContextFromMessageData(messageData);
      metadata = {
        actorUuid: inferred?.actor?.uuid,
        actorName: inferred?.actor?.name,
        skillId: inferred?.skillId,
        source: "ChatMessage.create fallback"
      };
    }

    const die = findD20Term(roll);
    if (!die) {
      debug("Silver Tongue skipped: no d20 term", roll);
      return false;
    }

    const selected = getSelectedD20Result(die);
    if (!selected || typeof selected.result !== "number") {
      debug("Silver Tongue skipped: no selected d20 result", die);
      return false;
    }

    const original = selected.result;
    if (original < 1 || original > 9) {
      debug("Silver Tongue not needed", original);
      return false;
    }

    const delta = 10 - original;
    selected.result = 10;
    if ("count" in selected) selected.count = 10;

    recalculateTerm(die, delta);
    recalculateRoll(roll, delta);

    roll.options ??= {};
    roll.options[MODULE_ID] ??= {};
    roll.options[MODULE_ID].silverTongue = {
      ...(metadata ?? {}),
      applied: true,
      original,
      adjusted: 10,
      delta
    };

    roll.flags ??= {};
    roll.flags[MODULE_ID] ??= {};
    roll.flags[MODULE_ID].silverTongue = roll.options[MODULE_ID].silverTongue;

    if (messageData) {
      messageData.flags ??= {};
      messageData.flags[MODULE_ID] ??= {};
      messageData.flags[MODULE_ID].silverTongue = roll.options[MODULE_ID].silverTongue;
    }

    debug(`Applied Silver Tongue: d20 ${original} -> 10 (+${delta}).`, roll);
    return true;
  }

  function buildSkillContext(actor, skillId, args) {
    const normalizedSkill = normalizeSkillId(skillId);
    return {
      actor,
      skillId: normalizedSkill,
      rawSkillId: skillId,
      eligible: setting("enableSilverTongue") && isEligibleSkill(normalizedSkill) && actorHasSilverTongue(actor),
      reason: getIneligibilityReason(actor, normalizedSkill),
      args
    };
  }

  function resolveContextFromConfig(config) {
    if (activeSkillContext) return activeSkillContext;

    const speakerActor = getActorFromSpeaker(config?.message?.speaker ?? config?.speaker);
    const possibleSkill = findSkillInObject(config);
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

  function getIneligibilityReason(actor, skillId) {
    if (!setting("enableSilverTongue")) return "Silver Tongue disabled";
    if (!isEligibleSkill(skillId)) return `skill ${skillId} is not Deception/Persuasion`;
    if (!actorHasSilverTongue(actor)) return "actor does not have Silver Tongue feature";
    return null;
  }

  function isFallbackEligible(messageData) {
    if (activeSkillContext?.eligible) {
      const speakerActor = getActorFromSpeaker(messageData?.speaker);
      if (speakerActor && activeSkillContext.actor && speakerActor.id !== activeSkillContext.actor.id) return false;
      return true;
    }

    const inferred = inferContextFromMessageData(messageData);
    if (!inferred?.eligible) {
      debug("Silver Tongue fallback skipped", inferred?.reason ?? "could not infer eligible skill check", messageData);
      return false;
    }

    return true;
  }

  function inferContextFromMessageData(messageData) {
    if (!setting("enableSilverTongue")) return { eligible: false, reason: "Silver Tongue disabled" };

    const actor = getActorFromSpeaker(messageData?.speaker);
    if (!actor) return { eligible: false, reason: "no actor in message speaker" };

    const skillId = findSkillInObject(messageData) ?? findSkillInText([
      messageData?.flavor,
      messageData?.content,
      messageData?.speaker?.alias,
      messageData?.flags
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

  function findSkillInText(values) {
    const text = values.map((value) => {
      try { return typeof value === "string" ? value : JSON.stringify(value ?? ""); }
      catch (_err) { return ""; }
    }).join(" ").toLowerCase().replace(/[ё]/g, "е");

    if (/\bdec(eption)?\b/.test(text) || text.includes("обман") || text.includes("deception")) return "dec";
    if (/\bper(suasion)?\b/.test(text) || text.includes("убеждение") || text.includes("persuasion")) return "per";
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

  function findSkillInObject(value, depth = 0) {
    if (depth > 5 || value == null) return null;
    if (typeof value === "string" && isEligibleSkill(value)) return value;
    if (typeof value !== "object") return null;

    for (const key of ["skill", "skillId", "skillID", "id", "abilityId", "name", "label"]) {
      if (isEligibleSkill(value[key])) return value[key];
    }

    for (const child of Object.values(value)) {
      const found = findSkillInObject(child, depth + 1);
      if (found) return found;
    }
    return null;
  }

  function findD20Term(roll) {
    return (roll.terms ?? []).find((term) => {
      const faces = Number(term.faces ?? 0);
      return faces === 20 && Array.isArray(term.results);
    });
  }

  function getSelectedD20Result(die) {
    const results = die.results ?? [];
    const active = results.filter((result) => result.active !== false && !result.discarded && !result.rerolled && !result.exploded);
    if (active.length) return active[active.length - 1];
    return results.find((result) => result.active !== false && !result.discarded) ?? results[results.length - 1];
  }

  function recalculateTerm(term, delta) {
    if (typeof term._total === "number") term._total += delta;
    if (typeof term.total === "number" && !Object.getOwnPropertyDescriptor(Object.getPrototypeOf(term), "total")?.get) term.total += delta;
  }

  function recalculateRoll(roll, delta) {
    if (typeof roll._total === "number") roll._total += delta;
    if (typeof roll.total === "number" && !Object.getOwnPropertyDescriptor(Object.getPrototypeOf(roll), "total")?.get) roll.total += delta;
  }

  function getActorFromSpeaker(speaker) {
    if (!speaker) return null;
    if (speaker.actor) return game.actors?.get(speaker.actor) ?? null;
    if (speaker.token) {
      const token = canvas?.tokens?.get?.(speaker.token)?.document;
      return token?.actor ?? null;
    }
    return null;
  }

  function normalizeSkillId(skillId) {
    return String(skillId ?? "").trim().toLowerCase();
  }

  function isEligibleSkill(skillId) {
    return TARGET_SKILLS.has(normalizeSkillId(skillId));
  }

  function normalizeName(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[ё]/g, "е");
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
