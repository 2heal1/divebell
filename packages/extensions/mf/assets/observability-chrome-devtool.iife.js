var ModuleFederationChromeObservabilityPlugin = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
  var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
  var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
  var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

  // ../../semver/internal/constants.js
  var require_constants = __commonJS({
    "../../semver/internal/constants.js"(exports, module) {
      "use strict";
      var SEMVER_SPEC_VERSION = "2.0.0";
      var MAX_LENGTH = 256;
      var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
      9007199254740991;
      var MAX_SAFE_COMPONENT_LENGTH = 16;
      var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
      var RELEASE_TYPES = [
        "major",
        "premajor",
        "minor",
        "preminor",
        "patch",
        "prepatch",
        "prerelease"
      ];
      module.exports = {
        MAX_LENGTH,
        MAX_SAFE_COMPONENT_LENGTH,
        MAX_SAFE_BUILD_LENGTH,
        MAX_SAFE_INTEGER,
        RELEASE_TYPES,
        SEMVER_SPEC_VERSION,
        FLAG_INCLUDE_PRERELEASE: 1,
        FLAG_LOOSE: 2
      };
    }
  });

  // ../../semver/internal/debug.js
  var require_debug = __commonJS({
    "../../semver/internal/debug.js"(exports, module) {
      "use strict";
      var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
      };
      module.exports = debug;
    }
  });

  // ../../semver/internal/re.js
  var require_re = __commonJS({
    "../../semver/internal/re.js"(exports, module) {
      "use strict";
      var {
        MAX_SAFE_COMPONENT_LENGTH,
        MAX_SAFE_BUILD_LENGTH,
        MAX_LENGTH
      } = require_constants();
      var debug = require_debug();
      exports = module.exports = {};
      var re = exports.re = [];
      var safeRe = exports.safeRe = [];
      var src = exports.src = [];
      var safeSrc = exports.safeSrc = [];
      var t = exports.t = {};
      var R = 0;
      var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
      var safeRegexReplacements = [
        ["\\s", 1],
        ["\\d", MAX_LENGTH],
        [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
      ];
      var makeSafeRegex = (value) => {
        for (const [token, max] of safeRegexReplacements) {
          value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
        }
        return value;
      };
      var createToken = (name, value, isGlobal) => {
        const safe = makeSafeRegex(value);
        const index = R++;
        debug(name, index, value);
        t[name] = index;
        src[index] = value;
        safeSrc[index] = safe;
        re[index] = new RegExp(value, isGlobal ? "g" : void 0);
        safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
      };
      createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
      createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
      createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
      createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
      createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
      createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
      createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
      createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
      createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
      createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
      createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
      createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
      createToken("FULL", `^${src[t.FULLPLAIN]}$`);
      createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
      createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
      createToken("GTLT", "((?:<|>)?=?)");
      createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
      createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
      createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
      createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
      createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
      createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
      createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
      createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
      createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
      createToken("COERCERTL", src[t.COERCE], true);
      createToken("COERCERTLFULL", src[t.COERCEFULL], true);
      createToken("LONETILDE", "(?:~>?)");
      createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
      exports.tildeTrimReplace = "$1~";
      createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
      createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
      createToken("LONECARET", "(?:\\^)");
      createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
      exports.caretTrimReplace = "$1^";
      createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
      createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
      createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
      createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
      createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
      exports.comparatorTrimReplace = "$1$2$3";
      createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
      createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
      createToken("STAR", "(<|>)?=?\\s*\\*");
      createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
      createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
    }
  });

  // ../../semver/internal/parse-options.js
  var require_parse_options = __commonJS({
    "../../semver/internal/parse-options.js"(exports, module) {
      "use strict";
      var looseOption = Object.freeze({ loose: true });
      var emptyOpts = Object.freeze({});
      var parseOptions = (options) => {
        if (!options) {
          return emptyOpts;
        }
        if (typeof options !== "object") {
          return looseOption;
        }
        return options;
      };
      module.exports = parseOptions;
    }
  });

  // ../../semver/internal/identifiers.js
  var require_identifiers = __commonJS({
    "../../semver/internal/identifiers.js"(exports, module) {
      "use strict";
      var numeric = /^[0-9]+$/;
      var compareIdentifiers = (a, b) => {
        if (typeof a === "number" && typeof b === "number") {
          return a === b ? 0 : a < b ? -1 : 1;
        }
        const anum = numeric.test(a);
        const bnum = numeric.test(b);
        if (anum && bnum) {
          a = +a;
          b = +b;
        }
        return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
      };
      var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
      module.exports = {
        compareIdentifiers,
        rcompareIdentifiers
      };
    }
  });

  // ../../semver/classes/semver.js
  var require_semver = __commonJS({
    "../../semver/classes/semver.js"(exports, module) {
      "use strict";
      var debug = require_debug();
      var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
      var { safeRe: re, t } = require_re();
      var parseOptions = require_parse_options();
      var { compareIdentifiers } = require_identifiers();
      var isPrereleaseIdentifier = (prerelease, identifier) => {
        const identifiers = identifier.split(".");
        if (identifiers.length > prerelease.length) {
          return false;
        }
        for (let i = 0; i < identifiers.length; i++) {
          if (compareIdentifiers(prerelease[i], identifiers[i]) !== 0) {
            return false;
          }
        }
        return true;
      };
      var SemVer = class _SemVer {
        constructor(version, options) {
          options = parseOptions(options);
          if (version instanceof _SemVer) {
            if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
              return version;
            } else {
              version = version.version;
            }
          } else if (typeof version !== "string") {
            throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
          }
          if (version.length > MAX_LENGTH) {
            throw new TypeError(
              `version is longer than ${MAX_LENGTH} characters`
            );
          }
          debug("SemVer", version, options);
          this.options = options;
          this.loose = !!options.loose;
          this.includePrerelease = !!options.includePrerelease;
          const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
          if (!m) {
            throw new TypeError(`Invalid Version: ${version}`);
          }
          this.raw = version;
          this.major = +m[1];
          this.minor = +m[2];
          this.patch = +m[3];
          if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
            throw new TypeError("Invalid major version");
          }
          if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
            throw new TypeError("Invalid minor version");
          }
          if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
            throw new TypeError("Invalid patch version");
          }
          if (!m[4]) {
            this.prerelease = [];
          } else {
            this.prerelease = m[4].split(".").map((id) => {
              if (/^[0-9]+$/.test(id)) {
                const num = +id;
                if (num >= 0 && num < MAX_SAFE_INTEGER) {
                  return num;
                }
              }
              return id;
            });
          }
          this.build = m[5] ? m[5].split(".") : [];
          this.format();
        }
        format() {
          this.version = `${this.major}.${this.minor}.${this.patch}`;
          if (this.prerelease.length) {
            this.version += `-${this.prerelease.join(".")}`;
          }
          return this.version;
        }
        toString() {
          return this.version;
        }
        compare(other) {
          debug("SemVer.compare", this.version, this.options, other);
          if (!(other instanceof _SemVer)) {
            if (typeof other === "string" && other === this.version) {
              return 0;
            }
            other = new _SemVer(other, this.options);
          }
          if (other.version === this.version) {
            return 0;
          }
          return this.compareMain(other) || this.comparePre(other);
        }
        compareMain(other) {
          if (!(other instanceof _SemVer)) {
            other = new _SemVer(other, this.options);
          }
          if (this.major < other.major) {
            return -1;
          }
          if (this.major > other.major) {
            return 1;
          }
          if (this.minor < other.minor) {
            return -1;
          }
          if (this.minor > other.minor) {
            return 1;
          }
          if (this.patch < other.patch) {
            return -1;
          }
          if (this.patch > other.patch) {
            return 1;
          }
          return 0;
        }
        comparePre(other) {
          if (!(other instanceof _SemVer)) {
            other = new _SemVer(other, this.options);
          }
          if (this.prerelease.length && !other.prerelease.length) {
            return -1;
          } else if (!this.prerelease.length && other.prerelease.length) {
            return 1;
          } else if (!this.prerelease.length && !other.prerelease.length) {
            return 0;
          }
          let i = 0;
          do {
            const a = this.prerelease[i];
            const b = other.prerelease[i];
            debug("prerelease compare", i, a, b);
            if (a === void 0 && b === void 0) {
              return 0;
            } else if (b === void 0) {
              return 1;
            } else if (a === void 0) {
              return -1;
            } else if (a === b) {
              continue;
            } else {
              return compareIdentifiers(a, b);
            }
          } while (++i);
        }
        compareBuild(other) {
          if (!(other instanceof _SemVer)) {
            other = new _SemVer(other, this.options);
          }
          let i = 0;
          do {
            const a = this.build[i];
            const b = other.build[i];
            debug("build compare", i, a, b);
            if (a === void 0 && b === void 0) {
              return 0;
            } else if (b === void 0) {
              return 1;
            } else if (a === void 0) {
              return -1;
            } else if (a === b) {
              continue;
            } else {
              return compareIdentifiers(a, b);
            }
          } while (++i);
        }
        // preminor will bump the version up to the next minor release, and immediately
        // down to pre-release. premajor and prepatch work the same way.
        inc(release, identifier, identifierBase) {
          if (release.startsWith("pre")) {
            if (!identifier && identifierBase === false) {
              throw new Error("invalid increment argument: identifier is empty");
            }
            if (identifier) {
              const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
              if (!match || match[1] !== identifier) {
                throw new Error(`invalid identifier: ${identifier}`);
              }
            }
          }
          switch (release) {
            case "premajor":
              this.prerelease.length = 0;
              this.patch = 0;
              this.minor = 0;
              this.major++;
              this.inc("pre", identifier, identifierBase);
              break;
            case "preminor":
              this.prerelease.length = 0;
              this.patch = 0;
              this.minor++;
              this.inc("pre", identifier, identifierBase);
              break;
            case "prepatch":
              this.prerelease.length = 0;
              this.inc("patch", identifier, identifierBase);
              this.inc("pre", identifier, identifierBase);
              break;
            // If the input is a non-prerelease version, this acts the same as
            // prepatch.
            case "prerelease":
              if (this.prerelease.length === 0) {
                this.inc("patch", identifier, identifierBase);
              }
              this.inc("pre", identifier, identifierBase);
              break;
            case "release":
              if (this.prerelease.length === 0) {
                throw new Error(`version ${this.raw} is not a prerelease`);
              }
              this.prerelease.length = 0;
              break;
            case "major":
              if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
                this.major++;
              }
              this.minor = 0;
              this.patch = 0;
              this.prerelease = [];
              break;
            case "minor":
              if (this.patch !== 0 || this.prerelease.length === 0) {
                this.minor++;
              }
              this.patch = 0;
              this.prerelease = [];
              break;
            case "patch":
              if (this.prerelease.length === 0) {
                this.patch++;
              }
              this.prerelease = [];
              break;
            // This probably shouldn't be used publicly.
            // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
            case "pre": {
              const base = Number(identifierBase) ? 1 : 0;
              if (this.prerelease.length === 0) {
                this.prerelease = [base];
              } else {
                let i = this.prerelease.length;
                while (--i >= 0) {
                  if (typeof this.prerelease[i] === "number") {
                    this.prerelease[i]++;
                    i = -2;
                  }
                }
                if (i === -1) {
                  if (identifier === this.prerelease.join(".") && identifierBase === false) {
                    throw new Error("invalid increment argument: identifier already exists");
                  }
                  this.prerelease.push(base);
                }
              }
              if (identifier) {
                let prerelease = [identifier, base];
                if (identifierBase === false) {
                  prerelease = [identifier];
                }
                if (isPrereleaseIdentifier(this.prerelease, identifier)) {
                  const prereleaseBase = this.prerelease[identifier.split(".").length];
                  if (isNaN(prereleaseBase)) {
                    this.prerelease = prerelease;
                  }
                } else {
                  this.prerelease = prerelease;
                }
              }
              break;
            }
            default:
              throw new Error(`invalid increment argument: ${release}`);
          }
          this.raw = this.format();
          if (this.build.length) {
            this.raw += `+${this.build.join(".")}`;
          }
          return this;
        }
      };
      module.exports = SemVer;
    }
  });

  // ../../semver/functions/parse.js
  var require_parse = __commonJS({
    "../../semver/functions/parse.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var parse = (version, options, throwErrors = false) => {
        if (version instanceof SemVer) {
          return version;
        }
        try {
          return new SemVer(version, options);
        } catch (er) {
          if (!throwErrors) {
            return null;
          }
          throw er;
        }
      };
      module.exports = parse;
    }
  });

  // ../../semver/functions/valid.js
  var require_valid = __commonJS({
    "../../semver/functions/valid.js"(exports, module) {
      "use strict";
      var parse = require_parse();
      var valid = (version, options) => {
        const v = parse(version, options);
        return v ? v.version : null;
      };
      module.exports = valid;
    }
  });

  // ../../semver/functions/clean.js
  var require_clean = __commonJS({
    "../../semver/functions/clean.js"(exports, module) {
      "use strict";
      var parse = require_parse();
      var clean = (version, options) => {
        const s = parse(version.trim().replace(/^[=v]+/, ""), options);
        return s ? s.version : null;
      };
      module.exports = clean;
    }
  });

  // ../../semver/functions/inc.js
  var require_inc = __commonJS({
    "../../semver/functions/inc.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var inc = (version, release, options, identifier, identifierBase) => {
        if (typeof options === "string") {
          identifierBase = identifier;
          identifier = options;
          options = void 0;
        }
        try {
          return new SemVer(
            version instanceof SemVer ? version.version : version,
            options
          ).inc(release, identifier, identifierBase).version;
        } catch (er) {
          return null;
        }
      };
      module.exports = inc;
    }
  });

  // ../../semver/functions/diff.js
  var require_diff = __commonJS({
    "../../semver/functions/diff.js"(exports, module) {
      "use strict";
      var parse = require_parse();
      var diff = (version1, version2) => {
        const v1 = parse(version1, null, true);
        const v2 = parse(version2, null, true);
        const comparison = v1.compare(v2);
        if (comparison === 0) {
          return null;
        }
        const v1Higher = comparison > 0;
        const highVersion = v1Higher ? v1 : v2;
        const lowVersion = v1Higher ? v2 : v1;
        const highHasPre = !!highVersion.prerelease.length;
        const lowHasPre = !!lowVersion.prerelease.length;
        if (lowHasPre && !highHasPre) {
          if (!lowVersion.patch && !lowVersion.minor) {
            return "major";
          }
          if (lowVersion.compareMain(highVersion) === 0) {
            if (lowVersion.minor && !lowVersion.patch) {
              return "minor";
            }
            return "patch";
          }
        }
        const prefix = highHasPre ? "pre" : "";
        if (v1.major !== v2.major) {
          return prefix + "major";
        }
        if (v1.minor !== v2.minor) {
          return prefix + "minor";
        }
        if (v1.patch !== v2.patch) {
          return prefix + "patch";
        }
        return "prerelease";
      };
      module.exports = diff;
    }
  });

  // ../../semver/functions/major.js
  var require_major = __commonJS({
    "../../semver/functions/major.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var major = (a, loose) => new SemVer(a, loose).major;
      module.exports = major;
    }
  });

  // ../../semver/functions/minor.js
  var require_minor = __commonJS({
    "../../semver/functions/minor.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var minor = (a, loose) => new SemVer(a, loose).minor;
      module.exports = minor;
    }
  });

  // ../../semver/functions/patch.js
  var require_patch = __commonJS({
    "../../semver/functions/patch.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var patch = (a, loose) => new SemVer(a, loose).patch;
      module.exports = patch;
    }
  });

  // ../../semver/functions/prerelease.js
  var require_prerelease = __commonJS({
    "../../semver/functions/prerelease.js"(exports, module) {
      "use strict";
      var parse = require_parse();
      var prerelease = (version, options) => {
        const parsed = parse(version, options);
        return parsed && parsed.prerelease.length ? parsed.prerelease : null;
      };
      module.exports = prerelease;
    }
  });

  // ../../semver/functions/compare.js
  var require_compare = __commonJS({
    "../../semver/functions/compare.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
      module.exports = compare;
    }
  });

  // ../../semver/functions/rcompare.js
  var require_rcompare = __commonJS({
    "../../semver/functions/rcompare.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var rcompare = (a, b, loose) => compare(b, a, loose);
      module.exports = rcompare;
    }
  });

  // ../../semver/functions/compare-loose.js
  var require_compare_loose = __commonJS({
    "../../semver/functions/compare-loose.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var compareLoose = (a, b) => compare(a, b, true);
      module.exports = compareLoose;
    }
  });

  // ../../semver/functions/compare-build.js
  var require_compare_build = __commonJS({
    "../../semver/functions/compare-build.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var compareBuild = (a, b, loose) => {
        const versionA = new SemVer(a, loose);
        const versionB = new SemVer(b, loose);
        return versionA.compare(versionB) || versionA.compareBuild(versionB);
      };
      module.exports = compareBuild;
    }
  });

  // ../../semver/functions/sort.js
  var require_sort = __commonJS({
    "../../semver/functions/sort.js"(exports, module) {
      "use strict";
      var compareBuild = require_compare_build();
      var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
      module.exports = sort;
    }
  });

  // ../../semver/functions/rsort.js
  var require_rsort = __commonJS({
    "../../semver/functions/rsort.js"(exports, module) {
      "use strict";
      var compareBuild = require_compare_build();
      var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
      module.exports = rsort;
    }
  });

  // ../../semver/functions/gt.js
  var require_gt = __commonJS({
    "../../semver/functions/gt.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var gt = (a, b, loose) => compare(a, b, loose) > 0;
      module.exports = gt;
    }
  });

  // ../../semver/functions/lt.js
  var require_lt = __commonJS({
    "../../semver/functions/lt.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var lt = (a, b, loose) => compare(a, b, loose) < 0;
      module.exports = lt;
    }
  });

  // ../../semver/functions/eq.js
  var require_eq = __commonJS({
    "../../semver/functions/eq.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var eq = (a, b, loose) => compare(a, b, loose) === 0;
      module.exports = eq;
    }
  });

  // ../../semver/functions/neq.js
  var require_neq = __commonJS({
    "../../semver/functions/neq.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var neq = (a, b, loose) => compare(a, b, loose) !== 0;
      module.exports = neq;
    }
  });

  // ../../semver/functions/gte.js
  var require_gte = __commonJS({
    "../../semver/functions/gte.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var gte = (a, b, loose) => compare(a, b, loose) >= 0;
      module.exports = gte;
    }
  });

  // ../../semver/functions/lte.js
  var require_lte = __commonJS({
    "../../semver/functions/lte.js"(exports, module) {
      "use strict";
      var compare = require_compare();
      var lte = (a, b, loose) => compare(a, b, loose) <= 0;
      module.exports = lte;
    }
  });

  // ../../semver/functions/cmp.js
  var require_cmp = __commonJS({
    "../../semver/functions/cmp.js"(exports, module) {
      "use strict";
      var eq = require_eq();
      var neq = require_neq();
      var gt = require_gt();
      var gte = require_gte();
      var lt = require_lt();
      var lte = require_lte();
      var cmp = (a, op, b, loose) => {
        switch (op) {
          case "===":
            if (typeof a === "object") {
              a = a.version;
            }
            if (typeof b === "object") {
              b = b.version;
            }
            return a === b;
          case "!==":
            if (typeof a === "object") {
              a = a.version;
            }
            if (typeof b === "object") {
              b = b.version;
            }
            return a !== b;
          case "":
          case "=":
          case "==":
            return eq(a, b, loose);
          case "!=":
            return neq(a, b, loose);
          case ">":
            return gt(a, b, loose);
          case ">=":
            return gte(a, b, loose);
          case "<":
            return lt(a, b, loose);
          case "<=":
            return lte(a, b, loose);
          default:
            throw new TypeError(`Invalid operator: ${op}`);
        }
      };
      module.exports = cmp;
    }
  });

  // ../../semver/functions/coerce.js
  var require_coerce = __commonJS({
    "../../semver/functions/coerce.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var parse = require_parse();
      var { safeRe: re, t } = require_re();
      var coerce = (version, options) => {
        if (version instanceof SemVer) {
          return version;
        }
        if (typeof version === "number") {
          version = String(version);
        }
        if (typeof version !== "string") {
          return null;
        }
        options = options || {};
        let match = null;
        if (!options.rtl) {
          match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
        } else {
          const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
          let next;
          while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
            if (!match || next.index + next[0].length !== match.index + match[0].length) {
              match = next;
            }
            coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
          }
          coerceRtlRegex.lastIndex = -1;
        }
        if (match === null) {
          return null;
        }
        const major = match[2];
        const minor = match[3] || "0";
        const patch = match[4] || "0";
        const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
        const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
        return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options);
      };
      module.exports = coerce;
    }
  });

  // ../../semver/functions/truncate.js
  var require_truncate = __commonJS({
    "../../semver/functions/truncate.js"(exports, module) {
      "use strict";
      var parse = require_parse();
      var constants = require_constants();
      var SemVer = require_semver();
      var truncate = (version, truncation, options) => {
        if (!constants.RELEASE_TYPES.includes(truncation)) {
          return null;
        }
        const clonedVersion = cloneInputVersion(version, options);
        return clonedVersion && doTruncation(clonedVersion, truncation);
      };
      var cloneInputVersion = (version, options) => {
        const versionStringToParse = version instanceof SemVer ? version.version : version;
        return parse(versionStringToParse, options);
      };
      var doTruncation = (version, truncation) => {
        if (isPrerelease(truncation)) {
          return version.version;
        }
        version.prerelease = [];
        switch (truncation) {
          case "major":
            version.minor = 0;
            version.patch = 0;
            break;
          case "minor":
            version.patch = 0;
            break;
        }
        return version.format();
      };
      var isPrerelease = (type) => {
        return type.startsWith("pre");
      };
      module.exports = truncate;
    }
  });

  // ../../semver/internal/lrucache.js
  var require_lrucache = __commonJS({
    "../../semver/internal/lrucache.js"(exports, module) {
      "use strict";
      var LRUCache = class {
        constructor() {
          this.max = 1e3;
          this.map = /* @__PURE__ */ new Map();
        }
        get(key) {
          const value = this.map.get(key);
          if (value === void 0) {
            return void 0;
          } else {
            this.map.delete(key);
            this.map.set(key, value);
            return value;
          }
        }
        delete(key) {
          return this.map.delete(key);
        }
        set(key, value) {
          const deleted = this.delete(key);
          if (!deleted && value !== void 0) {
            if (this.map.size >= this.max) {
              const firstKey = this.map.keys().next().value;
              this.delete(firstKey);
            }
            this.map.set(key, value);
          }
          return this;
        }
      };
      module.exports = LRUCache;
    }
  });

  // ../../semver/classes/range.js
  var require_range = __commonJS({
    "../../semver/classes/range.js"(exports, module) {
      "use strict";
      var SPACE_CHARACTERS = /\s+/g;
      var Range = class _Range {
        constructor(range, options) {
          options = parseOptions(options);
          if (range instanceof _Range) {
            if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) {
              return range;
            } else {
              return new _Range(range.raw, options);
            }
          }
          if (range instanceof Comparator) {
            this.raw = range.value;
            this.set = [[range]];
            this.formatted = void 0;
            return this;
          }
          this.options = options;
          this.loose = !!options.loose;
          this.includePrerelease = !!options.includePrerelease;
          this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
          this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
          if (!this.set.length) {
            throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
          }
          if (this.set.length > 1) {
            const first = this.set[0];
            this.set = this.set.filter((c) => !isNullSet(c[0]));
            if (this.set.length === 0) {
              this.set = [first];
            } else if (this.set.length > 1) {
              for (const c of this.set) {
                if (c.length === 1 && isAny(c[0])) {
                  this.set = [c];
                  break;
                }
              }
            }
          }
          this.formatted = void 0;
        }
        get range() {
          if (this.formatted === void 0) {
            this.formatted = "";
            for (let i = 0; i < this.set.length; i++) {
              if (i > 0) {
                this.formatted += "||";
              }
              const comps = this.set[i];
              for (let k = 0; k < comps.length; k++) {
                if (k > 0) {
                  this.formatted += " ";
                }
                this.formatted += comps[k].toString().trim();
              }
            }
          }
          return this.formatted;
        }
        format() {
          return this.range;
        }
        toString() {
          return this.range;
        }
        parseRange(range) {
          range = range.replace(BUILDSTRIPRE, "");
          const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
          const memoKey = memoOpts + ":" + range;
          const cached = cache.get(memoKey);
          if (cached) {
            return cached;
          }
          const loose = this.options.loose;
          const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
          range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
          debug("hyphen replace", range);
          range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
          debug("comparator trim", range);
          range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
          debug("tilde trim", range);
          range = range.replace(re[t.CARETTRIM], caretTrimReplace);
          debug("caret trim", range);
          let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
          if (loose) {
            rangeList = rangeList.filter((comp) => {
              debug("loose invalid filter", comp, this.options);
              return !!comp.match(re[t.COMPARATORLOOSE]);
            });
          }
          debug("range list", rangeList);
          const rangeMap = /* @__PURE__ */ new Map();
          const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
          for (const comp of comparators) {
            if (isNullSet(comp)) {
              return [comp];
            }
            rangeMap.set(comp.value, comp);
          }
          if (rangeMap.size > 1 && rangeMap.has("")) {
            rangeMap.delete("");
          }
          const result = [...rangeMap.values()];
          cache.set(memoKey, result);
          return result;
        }
        intersects(range, options) {
          if (!(range instanceof _Range)) {
            throw new TypeError("a Range is required");
          }
          return this.set.some((thisComparators) => {
            return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
              return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
                return rangeComparators.every((rangeComparator) => {
                  return thisComparator.intersects(rangeComparator, options);
                });
              });
            });
          });
        }
        // if ANY of the sets match ALL of its comparators, then pass
        test(version) {
          if (!version) {
            return false;
          }
          if (typeof version === "string") {
            try {
              version = new SemVer(version, this.options);
            } catch (er) {
              return false;
            }
          }
          for (let i = 0; i < this.set.length; i++) {
            if (testSet(this.set[i], version, this.options)) {
              return true;
            }
          }
          return false;
        }
      };
      module.exports = Range;
      var LRU = require_lrucache();
      var cache = new LRU();
      var parseOptions = require_parse_options();
      var Comparator = require_comparator();
      var debug = require_debug();
      var SemVer = require_semver();
      var {
        safeRe: re,
        src,
        t,
        comparatorTrimReplace,
        tildeTrimReplace,
        caretTrimReplace
      } = require_re();
      var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
      var BUILDSTRIPRE = new RegExp(src[t.BUILD], "g");
      var isNullSet = (c) => c.value === "<0.0.0-0";
      var isAny = (c) => c.value === "";
      var isSatisfiable = (comparators, options) => {
        let result = true;
        const remainingComparators = comparators.slice();
        let testComparator = remainingComparators.pop();
        while (result && remainingComparators.length) {
          result = remainingComparators.every((otherComparator) => {
            return testComparator.intersects(otherComparator, options);
          });
          testComparator = remainingComparators.pop();
        }
        return result;
      };
      var parseComparator = (comp, options) => {
        comp = comp.replace(re[t.BUILD], "");
        debug("comp", comp, options);
        comp = replaceCarets(comp, options);
        debug("caret", comp);
        comp = replaceTildes(comp, options);
        debug("tildes", comp);
        comp = replaceXRanges(comp, options);
        debug("xrange", comp);
        comp = replaceStars(comp, options);
        debug("stars", comp);
        return comp;
      };
      var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
      var invalidXRangeOrder = (M, m, p) => isX(M) && !isX(m) || isX(m) && p && !isX(p);
      var replaceTildes = (comp, options) => {
        return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
      };
      var replaceTilde = (comp, options) => {
        const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
        const z = options.includePrerelease ? "-0" : "";
        return comp.replace(r, (_, M, m, p, pr) => {
          debug("tilde", comp, _, M, m, p, pr);
          let ret;
          if (isX(M)) {
            ret = "";
          } else if (isX(m)) {
            ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
          } else if (isX(p)) {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else if (pr) {
            debug("replaceTilde pr", pr);
            ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
          }
          debug("tilde return", ret);
          return ret;
        });
      };
      var replaceCarets = (comp, options) => {
        return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
      };
      var replaceCaret = (comp, options) => {
        debug("caret", comp, options);
        const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
        const z = options.includePrerelease ? "-0" : "";
        return comp.replace(r, (_, M, m, p, pr) => {
          debug("caret", comp, _, M, m, p, pr);
          let ret;
          if (isX(M)) {
            ret = "";
          } else if (isX(m)) {
            ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
          } else if (isX(p)) {
            if (M === "0") {
              ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
            } else {
              ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
            }
          } else if (pr) {
            debug("replaceCaret pr", pr);
            if (M === "0") {
              if (m === "0") {
                ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
              } else {
                ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
              }
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
            }
          } else {
            debug("no pr");
            if (M === "0") {
              if (m === "0") {
                ret = `>=${M}.${m}.${p} <${M}.${m}.${+p + 1}-0`;
              } else {
                ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
              }
            } else {
              ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
            }
          }
          debug("caret return", ret);
          return ret;
        });
      };
      var replaceXRanges = (comp, options) => {
        debug("replaceXRanges", comp, options);
        return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
      };
      var replaceXRange = (comp, options) => {
        comp = comp.trim();
        const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
        return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
          debug("xRange", comp, ret, gtlt, M, m, p, pr);
          if (invalidXRangeOrder(M, m, p)) {
            return comp;
          }
          const xM = isX(M);
          const xm = xM || isX(m);
          const xp = xm || isX(p);
          const anyX = xp;
          if (gtlt === "=" && anyX) {
            gtlt = "";
          }
          pr = options.includePrerelease ? "-0" : "";
          if (xM) {
            if (gtlt === ">" || gtlt === "<") {
              ret = "<0.0.0-0";
            } else {
              ret = "*";
            }
          } else if (gtlt && anyX) {
            if (xm) {
              m = 0;
            }
            p = 0;
            if (gtlt === ">") {
              gtlt = ">=";
              if (xm) {
                M = +M + 1;
                m = 0;
                p = 0;
              } else {
                m = +m + 1;
                p = 0;
              }
            } else if (gtlt === "<=") {
              gtlt = "<";
              if (xm) {
                M = +M + 1;
              } else {
                m = +m + 1;
              }
            }
            if (gtlt === "<") {
              pr = "-0";
            }
            ret = `${gtlt + M}.${m}.${p}${pr}`;
          } else if (xm) {
            ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
          } else if (xp) {
            ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
          }
          debug("xRange return", ret);
          return ret;
        });
      };
      var replaceStars = (comp, options) => {
        debug("replaceStars", comp, options);
        return comp.trim().replace(re[t.STAR], "");
      };
      var replaceGTE0 = (comp, options) => {
        debug("replaceGTE0", comp, options);
        return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
      };
      var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
        if (isX(fM)) {
          from = "";
        } else if (isX(fm)) {
          from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
        } else if (isX(fp)) {
          from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
        } else if (fpr) {
          from = `>=${from}`;
        } else {
          from = `>=${from}${incPr ? "-0" : ""}`;
        }
        if (isX(tM)) {
          to = "";
        } else if (isX(tm)) {
          to = `<${+tM + 1}.0.0-0`;
        } else if (isX(tp)) {
          to = `<${tM}.${+tm + 1}.0-0`;
        } else if (tpr) {
          to = `<=${tM}.${tm}.${tp}-${tpr}`;
        } else if (incPr) {
          to = `<${tM}.${tm}.${+tp + 1}-0`;
        } else {
          to = `<=${to}`;
        }
        return `${from} ${to}`.trim();
      };
      var testSet = (set, version, options) => {
        for (let i = 0; i < set.length; i++) {
          if (!set[i].test(version)) {
            return false;
          }
        }
        if (version.prerelease.length && !options.includePrerelease) {
          for (let i = 0; i < set.length; i++) {
            debug(set[i].semver);
            if (set[i].semver === Comparator.ANY) {
              continue;
            }
            if (set[i].semver.prerelease.length > 0) {
              const allowed = set[i].semver;
              if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
                return true;
              }
            }
          }
          return false;
        }
        return true;
      };
    }
  });

  // ../../semver/classes/comparator.js
  var require_comparator = __commonJS({
    "../../semver/classes/comparator.js"(exports, module) {
      "use strict";
      var ANY = /* @__PURE__ */ Symbol("SemVer ANY");
      var Comparator = class _Comparator {
        static get ANY() {
          return ANY;
        }
        constructor(comp, options) {
          options = parseOptions(options);
          if (comp instanceof _Comparator) {
            if (comp.loose === !!options.loose) {
              return comp;
            } else {
              comp = comp.value;
            }
          }
          comp = comp.trim().split(/\s+/).join(" ");
          debug("comparator", comp, options);
          this.options = options;
          this.loose = !!options.loose;
          this.parse(comp);
          if (this.semver === ANY) {
            this.value = "";
          } else {
            this.value = this.operator + this.semver.version;
          }
          debug("comp", this);
        }
        parse(comp) {
          const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
          const m = comp.match(r);
          if (!m) {
            throw new TypeError(`Invalid comparator: ${comp}`);
          }
          this.operator = m[1] !== void 0 ? m[1] : "";
          if (this.operator === "=") {
            this.operator = "";
          }
          if (!m[2]) {
            this.semver = ANY;
          } else {
            this.semver = new SemVer(m[2], this.options.loose);
          }
        }
        toString() {
          return this.value;
        }
        test(version) {
          debug("Comparator.test", version, this.options.loose);
          if (this.semver === ANY || version === ANY) {
            return true;
          }
          if (typeof version === "string") {
            try {
              version = new SemVer(version, this.options);
            } catch (er) {
              return false;
            }
          }
          return cmp(version, this.operator, this.semver, this.options);
        }
        intersects(comp, options) {
          if (!(comp instanceof _Comparator)) {
            throw new TypeError("a Comparator is required");
          }
          if (this.operator === "") {
            if (this.value === "") {
              return true;
            }
            return new Range(comp.value, options).test(this.value);
          } else if (comp.operator === "") {
            if (comp.value === "") {
              return true;
            }
            return new Range(this.value, options).test(comp.semver);
          }
          options = parseOptions(options);
          if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
            return false;
          }
          if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
            return false;
          }
          if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
            return true;
          }
          if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
            return true;
          }
          if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
            return true;
          }
          if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
            return true;
          }
          if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
            return true;
          }
          return false;
        }
      };
      module.exports = Comparator;
      var parseOptions = require_parse_options();
      var { safeRe: re, t } = require_re();
      var cmp = require_cmp();
      var debug = require_debug();
      var SemVer = require_semver();
      var Range = require_range();
    }
  });

  // ../../semver/functions/satisfies.js
  var require_satisfies = __commonJS({
    "../../semver/functions/satisfies.js"(exports, module) {
      "use strict";
      var Range = require_range();
      var satisfies2 = (version, range, options) => {
        try {
          range = new Range(range, options);
        } catch (er) {
          return false;
        }
        return range.test(version);
      };
      module.exports = satisfies2;
    }
  });

  // ../../semver/ranges/to-comparators.js
  var require_to_comparators = __commonJS({
    "../../semver/ranges/to-comparators.js"(exports, module) {
      "use strict";
      var Range = require_range();
      var toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
      module.exports = toComparators;
    }
  });

  // ../../semver/ranges/max-satisfying.js
  var require_max_satisfying = __commonJS({
    "../../semver/ranges/max-satisfying.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var Range = require_range();
      var maxSatisfying = (versions, range, options) => {
        let max = null;
        let maxSV = null;
        let rangeObj = null;
        try {
          rangeObj = new Range(range, options);
        } catch (er) {
          return null;
        }
        versions.forEach((v) => {
          if (rangeObj.test(v)) {
            if (!max || maxSV.compare(v) === -1) {
              max = v;
              maxSV = new SemVer(max, options);
            }
          }
        });
        return max;
      };
      module.exports = maxSatisfying;
    }
  });

  // ../../semver/ranges/min-satisfying.js
  var require_min_satisfying = __commonJS({
    "../../semver/ranges/min-satisfying.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var Range = require_range();
      var minSatisfying = (versions, range, options) => {
        let min = null;
        let minSV = null;
        let rangeObj = null;
        try {
          rangeObj = new Range(range, options);
        } catch (er) {
          return null;
        }
        versions.forEach((v) => {
          if (rangeObj.test(v)) {
            if (!min || minSV.compare(v) === 1) {
              min = v;
              minSV = new SemVer(min, options);
            }
          }
        });
        return min;
      };
      module.exports = minSatisfying;
    }
  });

  // ../../semver/ranges/min-version.js
  var require_min_version = __commonJS({
    "../../semver/ranges/min-version.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var Range = require_range();
      var gt = require_gt();
      var minVersion = (range, loose) => {
        range = new Range(range, loose);
        let minver = new SemVer("0.0.0");
        if (range.test(minver)) {
          return minver;
        }
        minver = new SemVer("0.0.0-0");
        if (range.test(minver)) {
          return minver;
        }
        minver = null;
        for (let i = 0; i < range.set.length; ++i) {
          const comparators = range.set[i];
          let setMin = null;
          comparators.forEach((comparator) => {
            const compver = new SemVer(comparator.semver.version);
            switch (comparator.operator) {
              case ">":
                if (compver.prerelease.length === 0) {
                  compver.patch++;
                } else {
                  compver.prerelease.push(0);
                }
                compver.raw = compver.format();
              /* fallthrough */
              case "":
              case ">=":
                if (!setMin || gt(compver, setMin)) {
                  setMin = compver;
                }
                break;
              case "<":
              case "<=":
                break;
              /* istanbul ignore next */
              default:
                throw new Error(`Unexpected operation: ${comparator.operator}`);
            }
          });
          if (setMin && (!minver || gt(minver, setMin))) {
            minver = setMin;
          }
        }
        if (minver && range.test(minver)) {
          return minver;
        }
        return null;
      };
      module.exports = minVersion;
    }
  });

  // ../../semver/ranges/valid.js
  var require_valid2 = __commonJS({
    "../../semver/ranges/valid.js"(exports, module) {
      "use strict";
      var Range = require_range();
      var validRange = (range, options) => {
        try {
          return new Range(range, options).range || "*";
        } catch (er) {
          return null;
        }
      };
      module.exports = validRange;
    }
  });

  // ../../semver/ranges/outside.js
  var require_outside = __commonJS({
    "../../semver/ranges/outside.js"(exports, module) {
      "use strict";
      var SemVer = require_semver();
      var Comparator = require_comparator();
      var { ANY } = Comparator;
      var Range = require_range();
      var satisfies2 = require_satisfies();
      var gt = require_gt();
      var lt = require_lt();
      var lte = require_lte();
      var gte = require_gte();
      var outside = (version, range, hilo, options) => {
        version = new SemVer(version, options);
        range = new Range(range, options);
        let gtfn, ltefn, ltfn, comp, ecomp;
        switch (hilo) {
          case ">":
            gtfn = gt;
            ltefn = lte;
            ltfn = lt;
            comp = ">";
            ecomp = ">=";
            break;
          case "<":
            gtfn = lt;
            ltefn = gte;
            ltfn = gt;
            comp = "<";
            ecomp = "<=";
            break;
          default:
            throw new TypeError('Must provide a hilo val of "<" or ">"');
        }
        if (satisfies2(version, range, options)) {
          return false;
        }
        for (let i = 0; i < range.set.length; ++i) {
          const comparators = range.set[i];
          let high = null;
          let low = null;
          comparators.forEach((comparator) => {
            if (comparator.semver === ANY) {
              comparator = new Comparator(">=0.0.0");
            }
            high = high || comparator;
            low = low || comparator;
            if (gtfn(comparator.semver, high.semver, options)) {
              high = comparator;
            } else if (ltfn(comparator.semver, low.semver, options)) {
              low = comparator;
            }
          });
          if (high.operator === comp || high.operator === ecomp) {
            return false;
          }
          if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
            return false;
          } else if (low.operator === ecomp && ltfn(version, low.semver)) {
            return false;
          }
        }
        return true;
      };
      module.exports = outside;
    }
  });

  // ../../semver/ranges/gtr.js
  var require_gtr = __commonJS({
    "../../semver/ranges/gtr.js"(exports, module) {
      "use strict";
      var outside = require_outside();
      var gtr = (version, range, options) => outside(version, range, ">", options);
      module.exports = gtr;
    }
  });

  // ../../semver/ranges/ltr.js
  var require_ltr = __commonJS({
    "../../semver/ranges/ltr.js"(exports, module) {
      "use strict";
      var outside = require_outside();
      var ltr = (version, range, options) => outside(version, range, "<", options);
      module.exports = ltr;
    }
  });

  // ../../semver/ranges/intersects.js
  var require_intersects = __commonJS({
    "../../semver/ranges/intersects.js"(exports, module) {
      "use strict";
      var Range = require_range();
      var intersects = (r1, r2, options) => {
        r1 = new Range(r1, options);
        r2 = new Range(r2, options);
        return r1.intersects(r2, options);
      };
      module.exports = intersects;
    }
  });

  // ../../semver/ranges/simplify.js
  var require_simplify = __commonJS({
    "../../semver/ranges/simplify.js"(exports, module) {
      "use strict";
      var satisfies2 = require_satisfies();
      var compare = require_compare();
      module.exports = (versions, range, options) => {
        const set = [];
        let first = null;
        let prev = null;
        const v = versions.sort((a, b) => compare(a, b, options));
        for (const version of v) {
          const included = satisfies2(version, range, options);
          if (included) {
            prev = version;
            if (!first) {
              first = version;
            }
          } else {
            if (prev) {
              set.push([first, prev]);
            }
            prev = null;
            first = null;
          }
        }
        if (first) {
          set.push([first, null]);
        }
        const ranges = [];
        for (const [min, max] of set) {
          if (min === max) {
            ranges.push(min);
          } else if (!max && min === v[0]) {
            ranges.push("*");
          } else if (!max) {
            ranges.push(`>=${min}`);
          } else if (min === v[0]) {
            ranges.push(`<=${max}`);
          } else {
            ranges.push(`${min} - ${max}`);
          }
        }
        const simplified = ranges.join(" || ");
        const original = typeof range.raw === "string" ? range.raw : String(range);
        return simplified.length < original.length ? simplified : range;
      };
    }
  });

  // ../../semver/ranges/subset.js
  var require_subset = __commonJS({
    "../../semver/ranges/subset.js"(exports, module) {
      "use strict";
      var Range = require_range();
      var Comparator = require_comparator();
      var { ANY } = Comparator;
      var satisfies2 = require_satisfies();
      var compare = require_compare();
      var subset = (sub, dom, options = {}) => {
        if (sub === dom) {
          return true;
        }
        sub = new Range(sub, options);
        dom = new Range(dom, options);
        let sawNonNull = false;
        OUTER: for (const simpleSub of sub.set) {
          for (const simpleDom of dom.set) {
            const isSub = simpleSubset(simpleSub, simpleDom, options);
            sawNonNull = sawNonNull || isSub !== null;
            if (isSub) {
              continue OUTER;
            }
          }
          if (sawNonNull) {
            return false;
          }
        }
        return true;
      };
      var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
      var minimumVersion = [new Comparator(">=0.0.0")];
      var simpleSubset = (sub, dom, options) => {
        if (sub === dom) {
          return true;
        }
        if (sub.length === 1 && sub[0].semver === ANY) {
          if (dom.length === 1 && dom[0].semver === ANY) {
            return true;
          } else if (options.includePrerelease) {
            sub = minimumVersionWithPreRelease;
          } else {
            sub = minimumVersion;
          }
        }
        if (dom.length === 1 && dom[0].semver === ANY) {
          if (options.includePrerelease) {
            return true;
          } else {
            dom = minimumVersion;
          }
        }
        const eqSet = /* @__PURE__ */ new Set();
        let gt, lt;
        for (const c of sub) {
          if (c.operator === ">" || c.operator === ">=") {
            gt = higherGT(gt, c, options);
          } else if (c.operator === "<" || c.operator === "<=") {
            lt = lowerLT(lt, c, options);
          } else {
            eqSet.add(c.semver);
          }
        }
        if (eqSet.size > 1) {
          return null;
        }
        let gtltComp;
        if (gt && lt) {
          gtltComp = compare(gt.semver, lt.semver, options);
          if (gtltComp > 0) {
            return null;
          } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
            return null;
          }
        }
        for (const eq of eqSet) {
          if (gt && !satisfies2(eq, String(gt), options)) {
            return null;
          }
          if (lt && !satisfies2(eq, String(lt), options)) {
            return null;
          }
          for (const c of dom) {
            if (!satisfies2(eq, String(c), options)) {
              return false;
            }
          }
          return true;
        }
        let higher, lower;
        let hasDomLT, hasDomGT;
        let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
        let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
        if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
          needDomLTPre = false;
        }
        for (const c of dom) {
          hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
          hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
          if (gt) {
            if (needDomGTPre) {
              if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
                needDomGTPre = false;
              }
            }
            if (c.operator === ">" || c.operator === ">=") {
              higher = higherGT(gt, c, options);
              if (higher === c && higher !== gt) {
                return false;
              }
            } else if (gt.operator === ">=" && !c.test(gt.semver)) {
              return false;
            }
          }
          if (lt) {
            if (needDomLTPre) {
              if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
                needDomLTPre = false;
              }
            }
            if (c.operator === "<" || c.operator === "<=") {
              lower = lowerLT(lt, c, options);
              if (lower === c && lower !== lt) {
                return false;
              }
            } else if (lt.operator === "<=" && !c.test(lt.semver)) {
              return false;
            }
          }
          if (!c.operator && (lt || gt) && gtltComp !== 0) {
            return false;
          }
        }
        if (gt && hasDomLT && !lt && gtltComp !== 0) {
          return false;
        }
        if (lt && hasDomGT && !gt && gtltComp !== 0) {
          return false;
        }
        if (needDomGTPre || needDomLTPre) {
          return false;
        }
        return true;
      };
      var higherGT = (a, b, options) => {
        if (!a) {
          return b;
        }
        const comp = compare(a.semver, b.semver, options);
        return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
      };
      var lowerLT = (a, b, options) => {
        if (!a) {
          return b;
        }
        const comp = compare(a.semver, b.semver, options);
        return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
      };
      module.exports = subset;
    }
  });

  // ../../semver/index.js
  var require_semver2 = __commonJS({
    "../../semver/index.js"(exports, module) {
      "use strict";
      var internalRe = require_re();
      var constants = require_constants();
      var SemVer = require_semver();
      var identifiers = require_identifiers();
      var parse = require_parse();
      var valid = require_valid();
      var clean = require_clean();
      var inc = require_inc();
      var diff = require_diff();
      var major = require_major();
      var minor = require_minor();
      var patch = require_patch();
      var prerelease = require_prerelease();
      var compare = require_compare();
      var rcompare = require_rcompare();
      var compareLoose = require_compare_loose();
      var compareBuild = require_compare_build();
      var sort = require_sort();
      var rsort = require_rsort();
      var gt = require_gt();
      var lt = require_lt();
      var eq = require_eq();
      var neq = require_neq();
      var gte = require_gte();
      var lte = require_lte();
      var cmp = require_cmp();
      var coerce = require_coerce();
      var truncate = require_truncate();
      var Comparator = require_comparator();
      var Range = require_range();
      var satisfies2 = require_satisfies();
      var toComparators = require_to_comparators();
      var maxSatisfying = require_max_satisfying();
      var minSatisfying = require_min_satisfying();
      var minVersion = require_min_version();
      var validRange = require_valid2();
      var outside = require_outside();
      var gtr = require_gtr();
      var ltr = require_ltr();
      var intersects = require_intersects();
      var simplifyRange = require_simplify();
      var subset = require_subset();
      module.exports = {
        parse,
        valid,
        clean,
        inc,
        diff,
        major,
        minor,
        patch,
        prerelease,
        compare,
        rcompare,
        compareLoose,
        compareBuild,
        sort,
        rsort,
        gt,
        lt,
        eq,
        neq,
        gte,
        lte,
        cmp,
        coerce,
        truncate,
        Comparator,
        Range,
        satisfies: satisfies2,
        toComparators,
        maxSatisfying,
        minSatisfying,
        minVersion,
        validRange,
        outside,
        gtr,
        ltr,
        intersects,
        simplifyRange,
        subset,
        SemVer,
        re: internalRe.re,
        src: internalRe.src,
        tokens: internalRe.t,
        SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
        RELEASE_TYPES: constants.RELEASE_TYPES,
        compareIdentifiers: identifiers.compareIdentifiers,
        rcompareIdentifiers: identifiers.rcompareIdentifiers
      };
    }
  });

  // dist/esm/chrome-devtool.js
  var chrome_devtool_exports = {};
  __export(chrome_devtool_exports, {
    ChromeObservabilityPlugin: () => ChromeObservabilityPlugin,
    default: () => ChromeObservabilityPlugin
  });

  // ../../@divebell/core/dist/shared/query.js
  function matchesValue(value, query) {
    if (query === void 0) {
      return true;
    }
    if (value === void 0) {
      return false;
    }
    const values = Array.isArray(query) ? query : [query];
    return values.includes(value);
  }
  function matchesAnyValue(values, query) {
    if (query === void 0) {
      return true;
    }
    const expected = Array.isArray(query) ? query : [query];
    return expected.some((value) => values.includes(value));
  }
  function matchesText(fields, query) {
    if (query === void 0 || query === "") {
      return true;
    }
    const normalizedQuery = query.toLowerCase();
    return fields.some((field) => field?.toLowerCase().includes(normalizedQuery));
  }

  // ../../@divebell/core/dist/action/registry.js
  var defaultActionSource = "business";
  var defaultActionRisk = "state-changing";
  var _clock, _actions;
  var ActionRegistry = class {
    constructor(clock) {
      __privateAdd(this, _clock);
      __privateAdd(this, _actions, /* @__PURE__ */ new Map());
      __privateSet(this, _clock, clock);
    }
    register(input) {
      const now = __privateGet(this, _clock).now();
      const existing = __privateGet(this, _actions).get(input.name);
      const action = normalizeAction(input, existing?.registeredAt ?? now, now);
      __privateGet(this, _actions).set(action.name, action);
    }
    unregister(actionName) {
      return __privateGet(this, _actions).delete(actionName);
    }
    get(actionName) {
      const action = __privateGet(this, _actions).get(actionName);
      return action === void 0 ? void 0 : cloneRegisteredAction(action);
    }
    list(query, snapshot) {
      return Array.from(__privateGet(this, _actions).values()).map((action) => toDescriptor(action, getAvailability(action.availableWhen, snapshot))).filter((action) => matchesAction(action, query)).map(cloneActionDescriptor);
    }
  };
  _clock = new WeakMap();
  _actions = new WeakMap();
  function getAvailability(availableWhen, snapshot) {
    if (availableWhen === void 0) {
      return { enabled: true };
    }
    const conditions = Array.isArray(availableWhen) ? availableWhen : [availableWhen];
    for (const condition of conditions) {
      const target = snapshot.targets[condition.id];
      if (target?.status !== condition.status) {
        return {
          enabled: false,
          reason: `Waiting for ${condition.id} to reach ${condition.status}.`
        };
      }
    }
    return { enabled: true };
  }
  function normalizeAction(input, registeredAt, updatedAt) {
    const name = assertNonEmptyString(input.name, "action name");
    if (typeof input.handler !== "function") {
      throw new Error("action handler must be a function");
    }
    const action = {
      name,
      source: input.source ?? defaultActionSource,
      risk: input.risk ?? defaultActionRisk,
      enabled: true,
      registeredAt,
      updatedAt,
      handler: input.handler
    };
    assignOptionalActionFields(action, input);
    return action;
  }
  function toDescriptor(action, availability) {
    const descriptor = {
      name: action.name,
      source: action.source,
      risk: action.risk,
      enabled: availability.enabled,
      registeredAt: action.registeredAt,
      updatedAt: action.updatedAt
    };
    assignOptionalActionFields(descriptor, action);
    if (!availability.enabled && availability.reason !== void 0) {
      descriptor.reason = availability.reason;
    }
    return descriptor;
  }
  function cloneRegisteredAction(action) {
    const clone = {
      ...cloneActionDescriptor(action),
      handler: action.handler
    };
    return clone;
  }
  function cloneActionDescriptor(action) {
    const clone = {
      name: action.name,
      source: action.source,
      risk: action.risk,
      enabled: action.enabled,
      registeredAt: action.registeredAt,
      updatedAt: action.updatedAt
    };
    assignOptionalActionFields(clone, action);
    if (action.reason !== void 0)
      clone.reason = action.reason;
    return clone;
  }
  function assignOptionalActionFields(target, input) {
    if (input.description !== void 0)
      target.description = input.description;
    if (input.availableWhen !== void 0) {
      target.availableWhen = Array.isArray(input.availableWhen) ? input.availableWhen.map((condition) => ({ ...condition })) : { ...input.availableWhen };
    }
    if (input.inputSchema !== void 0)
      target.inputSchema = cloneInputSchema(input.inputSchema);
  }
  function cloneInputSchema(schema) {
    if (schema === void 0) {
      return schema;
    }
    return structuredClone(schema);
  }
  function matchesAction(action, query) {
    if (query === void 0) {
      return true;
    }
    return matchesValue(action.name, query.name) && matchesValue(action.source, query.source) && matchesValue(action.risk, query.risk) && (query.enabled === void 0 || action.enabled === query.enabled) && matchesText([action.name, action.description], query.query);
  }
  function assertNonEmptyString(value, label) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`${label} must be a non-empty string`);
    }
    return value;
  }

  // ../../@divebell/core/dist/action/validation.js
  function validateActionPayload(schema, payload) {
    if (schema === void 0) {
      return void 0;
    }
    const value = payload ?? {};
    return validateObjectSchema(schema, value, "payload");
  }
  function validateObjectSchema(schema, value, path) {
    if (!isPlainObject(value)) {
      return createValidationError(`${path} must be an object`);
    }
    const properties = schema.properties ?? {};
    const required = schema.required ?? [];
    for (const key of required) {
      if (!(key in value)) {
        return createValidationError(`${path}.${key} is required`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          return createValidationError(`${path}.${key} is not allowed`);
        }
      }
    }
    for (const [key, property] of Object.entries(properties)) {
      if (key in value) {
        const error = validateProperty(property, value[key], `${path}.${key}`);
        if (error !== void 0) {
          return error;
        }
      }
    }
    return void 0;
  }
  function validateProperty(property, value, path) {
    if (property.enum !== void 0 && !property.enum.includes(value)) {
      return createValidationError(`${path} must be one of the declared enum values`);
    }
    switch (property.type) {
      case "string":
        return typeof value === "string" ? void 0 : createValidationError(`${path} must be a string`);
      case "number":
        return typeof value === "number" ? void 0 : createValidationError(`${path} must be a number`);
      case "boolean":
        return typeof value === "boolean" ? void 0 : createValidationError(`${path} must be a boolean`);
      case "array":
        return validateArrayProperty(property, value, path);
      case "object":
        return validateNestedObjectProperty(property, value, path);
    }
  }
  function validateArrayProperty(property, value, path) {
    if (!Array.isArray(value)) {
      return createValidationError(`${path} must be an array`);
    }
    if (property.items === void 0) {
      return void 0;
    }
    for (let index = 0; index < value.length; index += 1) {
      const error = validateProperty(property.items, value[index], `${path}[${index}]`);
      if (error !== void 0) {
        return error;
      }
    }
    return void 0;
  }
  function validateNestedObjectProperty(property, value, path) {
    const schema = {
      type: "object"
    };
    if (property.properties !== void 0)
      schema.properties = property.properties;
    if (property.required !== void 0)
      schema.required = property.required;
    if (property.additionalProperties !== void 0) {
      schema.additionalProperties = property.additionalProperties;
    }
    return validateObjectSchema(schema, value, path);
  }
  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function createValidationError(message) {
    return {
      message,
      code: "action_payload_invalid"
    };
  }

  // ../../@divebell/core/dist/event/log.js
  var DEFAULT_EVENT_LIMIT = 100;
  var _clock2, _events, _nextEventId;
  var EventLog = class {
    constructor(clock) {
      __privateAdd(this, _clock2);
      __privateAdd(this, _events, []);
      __privateAdd(this, _nextEventId, 1);
      __privateSet(this, _clock2, clock);
    }
    append(input) {
      const event = normalizeEvent(input, __privateGet(this, _nextEventId), __privateGet(this, _clock2).now());
      __privateSet(this, _nextEventId, __privateGet(this, _nextEventId) + 1);
      __privateGet(this, _events).push(event);
      return cloneEvent(event);
    }
    latestEventId() {
      return __privateGet(this, _nextEventId) - 1;
    }
    get(query) {
      const filtered = __privateGet(this, _events).filter((event) => matchesEvent(event, query));
      const limit = normalizeLimit(query?.limit);
      const truncated = filtered.length > limit;
      const events = truncated ? filtered.slice(filtered.length - limit) : filtered;
      return {
        events: events.map(cloneEvent),
        latestEventId: this.latestEventId(),
        truncated
      };
    }
  };
  _clock2 = new WeakMap();
  _events = new WeakMap();
  _nextEventId = new WeakMap();
  function normalizeEvent(input, id, timestamp) {
    const event = {
      id,
      type: input.type,
      source: input.source,
      timestamp
    };
    if (input.targetId !== void 0)
      event.targetId = input.targetId;
    if (input.actionName !== void 0)
      event.actionName = input.actionName;
    if (input.status !== void 0)
      event.status = input.status;
    if ("payload" in input)
      event.payload = input.payload;
    if (input.error !== void 0)
      event.error = { ...input.error };
    return event;
  }
  function cloneEvent(event) {
    const clone = {
      id: event.id,
      type: event.type,
      source: event.source,
      timestamp: event.timestamp
    };
    if (event.targetId !== void 0)
      clone.targetId = event.targetId;
    if (event.actionName !== void 0)
      clone.actionName = event.actionName;
    if (event.status !== void 0)
      clone.status = event.status;
    if ("payload" in event)
      clone.payload = event.payload;
    if (event.error !== void 0)
      clone.error = { ...event.error };
    return clone;
  }
  function matchesEvent(event, query) {
    if (query === void 0) {
      return true;
    }
    if (query.since !== void 0 && event.id <= query.since) {
      return false;
    }
    return matchesValue(event.targetId, query.targetId) && matchesValue(event.actionName, query.actionName) && matchesValue(event.type, query.type) && matchesValue(event.source, query.source) && matchesValue(event.status, query.status) && matchesEventText(event, query.query);
  }
  function matchesEventText(event, query) {
    return matchesText([
      event.targetId,
      event.actionName,
      event.type,
      event.source,
      event.status,
      event.error?.message,
      event.error?.code,
      event.error?.stack,
      stringifySearchValue(event.error?.data),
      stringifySearchValue(event.payload)
    ], query);
  }
  function stringifySearchValue(value) {
    if (value === void 0)
      return void 0;
    if (typeof value === "string")
      return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  function normalizeLimit(limit) {
    if (limit === void 0) {
      return DEFAULT_EVENT_LIMIT;
    }
    if (!Number.isFinite(limit) || limit < 1) {
      return DEFAULT_EVENT_LIMIT;
    }
    return Math.floor(limit);
  }

  // ../../@divebell/core/dist/snapshot/store.js
  var _clock3, _targets;
  var SnapshotStore = class {
    constructor(clock) {
      __privateAdd(this, _clock3);
      __privateAdd(this, _targets, /* @__PURE__ */ new Map());
      __privateSet(this, _clock3, clock);
    }
    update(target, input) {
      const updatedAt = __privateGet(this, _clock3).now();
      const next = {
        id: target.id,
        type: target.type,
        status: input.status,
        updatedAt
      };
      const source = input.source ?? target.source;
      if (source !== void 0)
        next.source = source;
      const description = input.description ?? target.description;
      if (description !== void 0)
        next.description = description;
      if ("data" in input)
        next.data = input.data;
      if (input.error !== void 0)
        next.error = { ...input.error };
      if (input.dependsOn !== void 0)
        next.dependsOn = [...input.dependsOn];
      __privateGet(this, _targets).set(next.id, next);
      return cloneSnapshotTarget(next);
    }
    remove(targetId) {
      __privateGet(this, _targets).delete(targetId);
    }
    get(query, latestEventId) {
      const targets = {};
      for (const target of __privateGet(this, _targets).values()) {
        if (matchesSnapshotTarget(target, query)) {
          targets[target.id] = cloneSnapshotTarget(target);
        }
      }
      return {
        targets,
        latestEventId,
        capturedAt: __privateGet(this, _clock3).now()
      };
    }
  };
  _clock3 = new WeakMap();
  _targets = new WeakMap();
  function matchesSnapshotTarget(target, query) {
    if (query === void 0) {
      return true;
    }
    return matchesValue(target.id, query.id) && matchesValue(target.type, query.type) && matchesValue(target.source, query.source) && matchesValue(target.status, query.status) && matchesText([target.id, target.description], query.query);
  }
  function cloneSnapshotTarget(target) {
    const clone = {
      id: target.id,
      type: target.type,
      status: target.status,
      updatedAt: target.updatedAt
    };
    if (target.source !== void 0)
      clone.source = target.source;
    if (target.description !== void 0)
      clone.description = target.description;
    if ("data" in target)
      clone.data = target.data;
    if (target.error !== void 0)
      clone.error = { ...target.error };
    if (target.dependsOn !== void 0)
      clone.dependsOn = [...target.dependsOn];
    return clone;
  }

  // ../../@divebell/core/dist/target/registry.js
  var _clock4, _targets2;
  var TargetRegistry = class {
    constructor(clock) {
      __privateAdd(this, _clock4);
      __privateAdd(this, _targets2, /* @__PURE__ */ new Map());
      __privateSet(this, _clock4, clock);
    }
    register(input) {
      const now = __privateGet(this, _clock4).now();
      const existing = __privateGet(this, _targets2).get(input.id);
      const descriptor = normalizeTarget(input, existing?.registeredAt ?? now, now);
      __privateGet(this, _targets2).set(descriptor.id, descriptor);
    }
    unregister(targetId) {
      return __privateGet(this, _targets2).delete(targetId);
    }
    get(targetId) {
      const descriptor = __privateGet(this, _targets2).get(targetId);
      return descriptor === void 0 ? void 0 : cloneTarget(descriptor);
    }
    list(query) {
      const descriptors = Array.from(__privateGet(this, _targets2).values());
      return descriptors.filter((target) => matchesTarget(target, query)).map(cloneTarget);
    }
  };
  _clock4 = new WeakMap();
  _targets2 = new WeakMap();
  function normalizeTarget(input, registeredAt, updatedAt) {
    const id = assertNonEmptyString2(input.id, "target id");
    const type = assertNonEmptyString2(input.type, "target type");
    const source = assertNonEmptyString2(input.source, "target source");
    const statuses = uniqueStatuses(input.statuses);
    const descriptor = {
      id,
      type,
      source,
      statuses,
      registeredAt,
      updatedAt
    };
    assignOptionalTargetFields(descriptor, input);
    return descriptor;
  }
  function assignOptionalTargetFields(descriptor, input) {
    if (input.label !== void 0)
      descriptor.label = input.label;
    if (input.description !== void 0)
      descriptor.description = input.description;
    if (input.params !== void 0)
      descriptor.params = input.params.map((param) => ({ ...param }));
    if (input.matcher !== void 0)
      descriptor.matcher = { ...input.matcher };
    if ("data" in input)
      descriptor.data = input.data;
  }
  function cloneTarget(target) {
    const clone = {
      id: target.id,
      type: target.type,
      source: target.source,
      statuses: [...target.statuses],
      registeredAt: target.registeredAt,
      updatedAt: target.updatedAt
    };
    assignOptionalTargetFields(clone, target);
    return clone;
  }
  function uniqueStatuses(statuses) {
    if (!Array.isArray(statuses) || statuses.length === 0) {
      throw new Error("target statuses must not be empty");
    }
    const unique = /* @__PURE__ */ new Set();
    for (const status of statuses) {
      unique.add(assertNonEmptyString2(status, "target status"));
    }
    return [...unique];
  }
  function assertNonEmptyString2(value, label) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`${label} must be a non-empty string`);
    }
    return value;
  }
  function matchesTarget(target, query) {
    if (query === void 0) {
      return true;
    }
    return matchesValue(target.id, query.id) && matchesValue(target.type, query.type) && matchesValue(target.source, query.source) && matchesAnyValue(target.statuses, query.status) && matchesText([target.id, target.label, target.description], query.query);
  }

  // ../../@divebell/core/dist/wait/condition.js
  function matchesRuntimeCondition(target, condition) {
    return target?.status === condition.status && matchesDataConditions(target.data, condition.where);
  }
  function matchesDataConditions(data, conditions) {
    if (conditions === void 0 || conditions.length === 0) {
      return true;
    }
    return conditions.every((condition) => {
      const values = getValuesByPath(data, condition.path);
      return values.some((value) => matchesExpectedValue(value, condition.equals));
    });
  }
  function getValuesByPath(value, path) {
    const segments = path.split(".").filter(Boolean);
    if (segments.length === 0) {
      return [value];
    }
    return segments.reduce((values, segment) => {
      const next = [];
      for (const item of values) {
        if (Array.isArray(item)) {
          for (const entry of item) {
            next.push(...readProperty(entry, segment));
          }
          continue;
        }
        next.push(...readProperty(item, segment));
      }
      return next;
    }, [value]);
  }
  function readProperty(value, segment) {
    if (value === null || typeof value !== "object") {
      return [];
    }
    if (!(segment in value)) {
      return [];
    }
    return [value[segment]];
  }
  function matchesExpectedValue(value, expected) {
    if (typeof expected === "string") {
      return String(value) === expected;
    }
    return Object.is(value, expected);
  }

  // ../../@divebell/core/dist/wait/manager.js
  var _waits, _nextWaitId, _WaitManager_instances, failWait_fn, clear_fn;
  var WaitManager = class {
    constructor() {
      __privateAdd(this, _WaitManager_instances);
      __privateAdd(this, _waits, /* @__PURE__ */ new Map());
      __privateAdd(this, _nextWaitId, 1);
    }
    waitFor(condition, options, getSnapshot) {
      return new Promise((resolve) => {
        const waitId = __privateGet(this, _nextWaitId);
        __privateSet(this, _nextWaitId, __privateGet(this, _nextWaitId) + 1);
        const timeout = normalizeTimeout(options?.timeout);
        const timer = setTimeout(() => {
          __privateMethod(this, _WaitManager_instances, failWait_fn).call(this, waitId, getSnapshot, "Timed out waiting for target status.");
        }, timeout);
        __privateGet(this, _waits).set(waitId, {
          id: waitId,
          condition: { ...condition },
          resolve,
          timer
        });
      });
    }
    resolveForTarget(targetId, getSnapshot) {
      for (const wait of __privateGet(this, _waits).values()) {
        if (wait.condition.id === targetId) {
          const snapshot = getSnapshot();
          const target = snapshot.targets[wait.condition.id];
          if (matchesRuntimeCondition(target, wait.condition)) {
            __privateMethod(this, _WaitManager_instances, clear_fn).call(this, wait);
            wait.resolve(createSuccessResult(wait.condition, snapshot, target));
          }
        }
      }
    }
    rejectForTarget(targetId, getSnapshot) {
      for (const wait of __privateGet(this, _waits).values()) {
        if (wait.condition.id === targetId) {
          __privateMethod(this, _WaitManager_instances, failWait_fn).call(this, wait.id, getSnapshot, "Target was unregistered.");
        }
      }
    }
  };
  _waits = new WeakMap();
  _nextWaitId = new WeakMap();
  _WaitManager_instances = new WeakSet();
  failWait_fn = function(waitId, getSnapshot, reason) {
    const wait = __privateGet(this, _waits).get(waitId);
    if (wait === void 0) {
      return;
    }
    __privateMethod(this, _WaitManager_instances, clear_fn).call(this, wait);
    wait.resolve({
      success: false,
      condition: wait.condition,
      snapshot: getSnapshot(),
      reason
    });
  };
  clear_fn = function(wait) {
    clearTimeout(wait.timer);
    __privateGet(this, _waits).delete(wait.id);
  };
  var defaultWaitTimeout = 5e3;
  function normalizeTimeout(timeout) {
    if (timeout === void 0 || !Number.isFinite(timeout) || timeout < 0) {
      return defaultWaitTimeout;
    }
    return Math.floor(timeout);
  }
  function createSuccessResult(condition, snapshot, target) {
    return {
      success: true,
      condition,
      snapshot,
      target
    };
  }

  // ../../@divebell/core/dist/runtime/center.js
  var systemSource = "divebell";
  var _targets3, _snapshot, _events2, _actions2, _waits2, _RuntimeCenter_instances, recordRejectedUpdate_fn, recordActionFailure_fn, createActionContext_fn;
  var RuntimeCenter = class {
    constructor(options = {}) {
      __privateAdd(this, _RuntimeCenter_instances);
      __privateAdd(this, _targets3);
      __privateAdd(this, _snapshot);
      __privateAdd(this, _events2);
      __privateAdd(this, _actions2);
      __privateAdd(this, _waits2, new WaitManager());
      const clock = options.clock ?? systemClock;
      __privateSet(this, _targets3, new TargetRegistry(clock));
      __privateSet(this, _snapshot, new SnapshotStore(clock));
      __privateSet(this, _events2, new EventLog(clock));
      __privateSet(this, _actions2, new ActionRegistry(clock));
    }
    registerTarget(target) {
      __privateGet(this, _targets3).register(target);
    }
    unregisterTarget(targetId) {
      __privateGet(this, _targets3).unregister(targetId);
      __privateGet(this, _snapshot).remove(targetId);
      __privateGet(this, _waits2).rejectForTarget(targetId, () => this.getSnapshot());
    }
    getTargets(query) {
      return __privateGet(this, _targets3).list(query);
    }
    updateSnapshot(input) {
      const target = __privateGet(this, _targets3).get(input.id);
      if (target === void 0) {
        __privateMethod(this, _RuntimeCenter_instances, recordRejectedUpdate_fn).call(this, input, {
          message: `Cannot update unregistered target "${input.id}".`,
          code: "target_not_registered"
        });
        return;
      }
      if (input.type !== void 0 && input.type !== target.type) {
        __privateMethod(this, _RuntimeCenter_instances, recordRejectedUpdate_fn).call(this, input, {
          message: `Snapshot type "${input.type}" does not match registered target type "${target.type}".`,
          code: "target_type_mismatch"
        }, target);
        return;
      }
      if (!target.statuses.includes(input.status)) {
        __privateMethod(this, _RuntimeCenter_instances, recordRejectedUpdate_fn).call(this, input, {
          message: `Status "${input.status}" is not declared for target "${input.id}".`,
          code: "target_status_not_declared"
        }, target);
        return;
      }
      __privateGet(this, _snapshot).update(target, input);
      __privateGet(this, _events2).append({
        type: "snapshot.updated",
        source: input.source ?? target.source,
        targetId: input.id,
        status: input.status,
        payload: normalizeAcceptedUpdate(input, target)
      });
      __privateGet(this, _waits2).resolveForTarget(input.id, () => this.getSnapshot());
    }
    getSnapshot(query) {
      return __privateGet(this, _snapshot).get(query, __privateGet(this, _events2).latestEventId());
    }
    getEvents(query) {
      return __privateGet(this, _events2).get(query);
    }
    registerAction(action) {
      __privateGet(this, _actions2).register(action);
    }
    unregisterAction(actionName) {
      __privateGet(this, _actions2).unregister(actionName);
    }
    getActions(query) {
      return __privateGet(this, _actions2).list(query, this.getSnapshot());
    }
    async runAction(actionName, payload) {
      const action = __privateGet(this, _actions2).get(actionName);
      if (action === void 0) {
        return __privateMethod(this, _RuntimeCenter_instances, recordActionFailure_fn).call(this, actionName, payload, {
          message: `Action "${actionName}" is not registered.`,
          code: "action_not_registered"
        });
      }
      const availability = getAvailability(action.availableWhen, this.getSnapshot());
      if (!availability.enabled) {
        return __privateMethod(this, _RuntimeCenter_instances, recordActionFailure_fn).call(this, actionName, payload, {
          message: availability.reason ?? `Action "${actionName}" is not available.`,
          code: "action_not_available"
        }, action.source);
      }
      const validationError = validateActionPayload(action.inputSchema, payload);
      if (validationError !== void 0) {
        return __privateMethod(this, _RuntimeCenter_instances, recordActionFailure_fn).call(this, actionName, payload, validationError, action.source);
      }
      __privateGet(this, _events2).append({
        type: "action.started",
        source: action.source,
        actionName,
        payload
      });
      try {
        const result = await action.handler(payload ?? {}, __privateMethod(this, _RuntimeCenter_instances, createActionContext_fn).call(this, actionName));
        __privateGet(this, _events2).append({
          type: "action.success",
          source: action.source,
          actionName,
          payload: result
        });
        return {
          success: true,
          actionName,
          result
        };
      } catch (error) {
        return __privateMethod(this, _RuntimeCenter_instances, recordActionFailure_fn).call(this, actionName, payload, toRuntimeError(error), action.source);
      }
    }
    waitFor(condition, options) {
      const snapshot = this.getSnapshot();
      const target = snapshot.targets[condition.id];
      if (matchesRuntimeCondition(target, condition)) {
        return Promise.resolve({
          success: true,
          condition,
          snapshot,
          target
        });
      }
      if (target === void 0 && __privateGet(this, _targets3).get(condition.id) === void 0) {
        return Promise.resolve({
          success: false,
          condition,
          snapshot,
          reason: "Target is not registered."
        });
      }
      return __privateGet(this, _waits2).waitFor(condition, options, () => this.getSnapshot());
    }
  };
  _targets3 = new WeakMap();
  _snapshot = new WeakMap();
  _events2 = new WeakMap();
  _actions2 = new WeakMap();
  _waits2 = new WeakMap();
  _RuntimeCenter_instances = new WeakSet();
  recordRejectedUpdate_fn = function(input, error, target) {
    __privateGet(this, _events2).append({
      type: "snapshot.update.rejected",
      source: input.source ?? target?.source ?? systemSource,
      targetId: input.id,
      status: input.status,
      payload: input,
      error
    });
  };
  recordActionFailure_fn = function(actionName, payload, error, source = systemSource) {
    __privateGet(this, _events2).append({
      type: "action.error",
      source,
      actionName,
      payload,
      error
    });
    return {
      success: false,
      actionName,
      error
    };
  };
  createActionContext_fn = function(actionName) {
    return {
      actionName,
      getSnapshot: () => this.getSnapshot(),
      updateSnapshot: (input) => this.updateSnapshot(input),
      waitFor: (condition, options) => this.waitFor(condition, options)
    };
  };
  function createDivebell(options) {
    return new RuntimeCenter(options);
  }
  var systemClock = {
    now: () => Date.now()
  };
  function normalizeAcceptedUpdate(input, target) {
    const payload = {
      id: input.id,
      type: target.type,
      source: input.source ?? target.source,
      status: input.status
    };
    if (input.description !== void 0)
      payload.description = input.description;
    if ("data" in input)
      payload.data = input.data;
    if (input.error !== void 0)
      payload.error = { ...input.error };
    if (input.dependsOn !== void 0)
      payload.dependsOn = [...input.dependsOn];
    return payload;
  }
  function toRuntimeError(error) {
    if (error instanceof Error) {
      const runtimeError = {
        message: error.message
      };
      if (error.stack !== void 0) {
        runtimeError.stack = error.stack;
      }
      return runtimeError;
    }
    return {
      message: String(error)
    };
  }

  // ../../@divebell/core/dist/runtime/window.js
  function installDivebellOnWindow(runtime = createDivebell(), host = getDefaultWindowHost(), options = {}) {
    if (host === void 0) {
      return runtime;
    }
    const registry = getOrCreateDivebellRegistry(host);
    registry.register(runtime, options);
    host.__DIVEBELL__ ?? (host.__DIVEBELL__ = runtime);
    return runtime;
  }
  function getDivebellFromWindow(host = getDefaultWindowHost()) {
    return host?.__DIVEBELL__;
  }
  function getOrCreateDivebellRegistry(host) {
    host.__DIVEBELL_REGISTRY__ ?? (host.__DIVEBELL_REGISTRY__ = new WindowRuntimeRegistry());
    return host.__DIVEBELL_REGISTRY__;
  }
  var _instances, _runtimeIds, _listeners, _WindowRuntimeRegistry_instances, emit_fn;
  var WindowRuntimeRegistry = class {
    constructor() {
      __privateAdd(this, _WindowRuntimeRegistry_instances);
      __privateAdd(this, _instances, /* @__PURE__ */ new Map());
      __privateAdd(this, _runtimeIds, /* @__PURE__ */ new WeakMap());
      __privateAdd(this, _listeners, /* @__PURE__ */ new Set());
    }
    register(runtime, options = {}) {
      const existingId = __privateGet(this, _runtimeIds).get(runtime);
      if (existingId !== void 0) {
        return __privateGet(this, _instances).get(existingId);
      }
      const runtimeId = normalizeRuntimeId(options.runtimeId) ?? createRuntimeId();
      const collision = __privateGet(this, _instances).get(runtimeId);
      if (collision !== void 0 && collision.runtime !== runtime) {
        throw new Error(`Divebell instance id "${runtimeId}" is already registered.`);
      }
      const name = normalizeOptional(options.name);
      const source = normalizeOptional(options.source);
      const parentRuntimeId = normalizeOptional(options.parentRuntimeId);
      const renderId = normalizeOptional(options.renderId);
      const instance = {
        runtimeId,
        runtime,
        ...name === void 0 ? {} : { name },
        ...source === void 0 ? {} : { source },
        ...parentRuntimeId === void 0 ? {} : { parentRuntimeId },
        ...renderId === void 0 ? {} : { renderId }
      };
      __privateGet(this, _instances).set(runtimeId, instance);
      __privateGet(this, _runtimeIds).set(runtime, runtimeId);
      __privateMethod(this, _WindowRuntimeRegistry_instances, emit_fn).call(this, { type: "registered", instance });
      return instance;
    }
    unregister(runtimeOrId) {
      const runtimeId = typeof runtimeOrId === "string" ? runtimeOrId : __privateGet(this, _runtimeIds).get(runtimeOrId);
      if (runtimeId === void 0)
        return false;
      const instance = __privateGet(this, _instances).get(runtimeId);
      if (instance === void 0)
        return false;
      __privateGet(this, _instances).delete(runtimeId);
      __privateGet(this, _runtimeIds).delete(instance.runtime);
      __privateMethod(this, _WindowRuntimeRegistry_instances, emit_fn).call(this, { type: "unregistered", instance });
      return true;
    }
    list() {
      return [...__privateGet(this, _instances).values()];
    }
    subscribe(listener) {
      __privateGet(this, _listeners).add(listener);
      return () => __privateGet(this, _listeners).delete(listener);
    }
  };
  _instances = new WeakMap();
  _runtimeIds = new WeakMap();
  _listeners = new WeakMap();
  _WindowRuntimeRegistry_instances = new WeakSet();
  emit_fn = function(event) {
    for (const listener of __privateGet(this, _listeners)) {
      listener(event);
    }
  };
  function createRuntimeId() {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid !== void 0)
      return `runtime-${uuid}`;
    return `runtime-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  function normalizeRuntimeId(value) {
    return normalizeOptional(value);
  }
  function normalizeOptional(value) {
    const normalized = value?.trim();
    return normalized === void 0 || normalized.length === 0 ? void 0 : normalized;
  }
  function getDefaultWindowHost() {
    if (typeof window === "undefined") {
      return void 0;
    }
    return window;
  }

  // ../sdk/dist/constant.js
  var BROWSER_LOG_KEY = "FEDERATION_DEBUG";
  var NameTransformSymbol = {
    AT: "@",
    HYPHEN: "-",
    SLASH: "/"
  };
  var NameTransformMap = {
    [NameTransformSymbol.AT]: "scope_",
    [NameTransformSymbol.HYPHEN]: "_",
    [NameTransformSymbol.SLASH]: "__"
  };
  var EncodedNameTransformMap = {
    [NameTransformMap[NameTransformSymbol.AT]]: NameTransformSymbol.AT,
    [NameTransformMap[NameTransformSymbol.HYPHEN]]: NameTransformSymbol.HYPHEN,
    [NameTransformMap[NameTransformSymbol.SLASH]]: NameTransformSymbol.SLASH
  };

  // ../sdk/dist/env.js
  var isBrowserEnvValue = typeof ENV_TARGET !== "undefined" ? ENV_TARGET === "web" : typeof window !== "undefined" && typeof window.document !== "undefined";
  function isBrowserEnv() {
    return isBrowserEnvValue;
  }
  function isBrowserDebug() {
    try {
      if (isBrowserEnv() && window.localStorage) return Boolean(localStorage.getItem(BROWSER_LOG_KEY));
    } catch (error) {
      return false;
    }
    return false;
  }
  function isDebugMode() {
    if (typeof process !== "undefined" && process.env && process.env["FEDERATION_DEBUG"]) return Boolean(process.env["FEDERATION_DEBUG"]);
    if (typeof FEDERATION_DEBUG !== "undefined" && Boolean(FEDERATION_DEBUG)) return true;
    return isBrowserDebug();
  }

  // ../sdk/dist/logger.js
  var PREFIX = "[ Module Federation ]";
  var DEFAULT_DELEGATE = console;
  var LOGGER_STACK_SKIP_TOKENS = [
    "logger.ts",
    "logger.js",
    "captureStackTrace",
    "Logger.emit",
    "Logger.log",
    "Logger.info",
    "Logger.warn",
    "Logger.error",
    "Logger.debug"
  ];
  function captureStackTrace() {
    try {
      const stack = (/* @__PURE__ */ new Error()).stack;
      if (!stack) return;
      const [, ...rawLines] = stack.split("\n");
      const filtered = rawLines.filter((line) => !LOGGER_STACK_SKIP_TOKENS.some((token) => line.includes(token)));
      if (!filtered.length) return;
      return `Stack trace:
${filtered.slice(0, 5).join("\n")}`;
    } catch {
      return;
    }
  }
  var Logger = class {
    constructor(prefix, delegate = DEFAULT_DELEGATE) {
      this.prefix = prefix;
      this.delegate = delegate ?? DEFAULT_DELEGATE;
    }
    setPrefix(prefix) {
      this.prefix = prefix;
    }
    setDelegate(delegate) {
      this.delegate = delegate ?? DEFAULT_DELEGATE;
    }
    emit(method, args) {
      const delegate = this.delegate;
      const stackTrace = isDebugMode() ? captureStackTrace() : void 0;
      const enrichedArgs = stackTrace ? [...args, stackTrace] : args;
      const order = (() => {
        switch (method) {
          case "log":
            return ["log", "info"];
          case "info":
            return ["info", "log"];
          case "warn":
            return [
              "warn",
              "info",
              "log"
            ];
          case "error":
            return [
              "error",
              "warn",
              "log"
            ];
          default:
            return ["debug", "log"];
        }
      })();
      for (const candidate of order) {
        const handler = delegate[candidate];
        if (typeof handler === "function") {
          handler.call(delegate, this.prefix, ...enrichedArgs);
          return;
        }
      }
      for (const candidate of order) {
        const handler = DEFAULT_DELEGATE[candidate];
        if (typeof handler === "function") {
          handler.call(DEFAULT_DELEGATE, this.prefix, ...enrichedArgs);
          return;
        }
      }
    }
    log(...args) {
      this.emit("log", args);
    }
    warn(...args) {
      this.emit("warn", args);
    }
    error(...args) {
      this.emit("error", args);
    }
    success(...args) {
      this.emit("info", args);
    }
    info(...args) {
      this.emit("info", args);
    }
    ready(...args) {
      this.emit("info", args);
    }
    debug(...args) {
      if (isDebugMode()) this.emit("debug", args);
    }
  };
  function createLogger(prefix) {
    return new Logger(prefix);
  }
  function createInfrastructureLogger(prefix) {
    const infrastructureLogger2 = new Logger(prefix);
    Object.defineProperty(infrastructureLogger2, "__mf_infrastructure_logger__", {
      value: true,
      enumerable: false,
      configurable: false
    });
    return infrastructureLogger2;
  }
  var logger = createLogger(PREFIX);
  var infrastructureLogger = createInfrastructureLogger(PREFIX);

  // dist/esm/core-DsPVxJ5T.js
  var import_semver = __toESM(require_semver2());
  var reportStatuses = [
    "pending",
    "success",
    "error"
  ];
  var reportOutcomes = [
    "pending",
    "runtime-loaded",
    "shared-resolved",
    "preloaded",
    "component-loaded",
    "failed",
    "recovered"
  ];
  function registerDivebellActions(runtime, source, reportReader, registeredActionRuntimes) {
    if (registeredActionRuntimes.has(runtime)) return;
    if (reportReader) {
      runtime.registerAction({
        name: "mf:get-runtime-state",
        source,
        risk: "safe",
        description: "Get the current safe Module Federation runtime state.",
        handler: () => reportReader.getRuntimeState()
      });
      runtime.registerAction({
        name: "mf:list-reports",
        source,
        risk: "safe",
        description: "List Module Federation loading report summaries.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: {
              type: "number",
              description: "Maximum report count to return."
            },
            traceId: {
              type: "string",
              description: "Exact report trace id."
            },
            instanceRef: {
              type: "string",
              description: "Stable observability instance reference."
            },
            remote: {
              type: "string",
              description: "Remote name or alias to match."
            },
            expose: {
              type: "string",
              description: "Exposed module to match."
            },
            shared: {
              type: "string",
              description: "Shared dependency name to match."
            },
            status: {
              type: "string",
              enum: reportStatuses,
              description: "Report status to match."
            },
            outcome: {
              type: "string",
              enum: reportOutcomes,
              description: "Report outcome to match."
            }
          }
        },
        handler: (payload) => listReports(reportReader, payload)
      });
      runtime.registerAction({
        name: "mf:get-latest-report",
        source,
        risk: "safe",
        description: "Get the latest Module Federation loading report.",
        handler: () => {
          const report = reportReader.getLatestReport();
          return {
            found: report !== void 0,
            report
          };
        }
      });
      runtime.registerAction({
        name: "mf:get-report",
        source,
        risk: "safe",
        description: "Get a Module Federation loading report by trace id.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["traceId"],
          properties: { traceId: {
            type: "string",
            description: "Report trace id."
          } }
        },
        handler: (payload) => {
          const traceId = getPayloadString(payload, "traceId");
          const report = traceId ? reportReader.getReport(traceId) : void 0;
          return {
            found: report !== void 0,
            traceId,
            report
          };
        }
      });
      runtime.registerAction({
        name: "mf:export-report",
        source,
        risk: "safe",
        description: "Export a Module Federation loading report.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: { traceId: {
            type: "string",
            description: "Report trace id. When omitted, exports latest report."
          } }
        },
        handler: (payload) => {
          const traceId = getPayloadString(payload, "traceId");
          const report = reportReader.exportReport(traceId);
          return {
            found: report !== void 0,
            traceId: report?.traceId || traceId,
            report
          };
        }
      });
    }
    if (!reportReader) {
      registeredActionRuntimes.add(runtime);
      return;
    }
    runtime.registerAction({
      name: "mf:get-federation-global",
      source,
      risk: "safe",
      description: "Get a summary of the current global MF runtime state.",
      handler: () => getFederationGlobalSummary(reportReader.getRuntimeState())
    });
    runtime.registerAction({
      name: "mf:get-federation-module-info",
      source,
      risk: "safe",
      description: "Get __FEDERATION__.moduleInfo or one moduleInfo entry.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: {
            type: "string",
            description: "moduleInfo key."
          },
          name: {
            type: "string",
            description: "moduleInfo name. Used when key is omitted."
          },
          instanceRef: {
            type: "string",
            description: "Consumer observability instance reference."
          }
        }
      },
      handler: (payload) => getFederationModuleInfoActionResult(payload, reportReader.getRuntimeState())
    });
    runtime.registerAction({
      name: "mf:list-federation-instances",
      source,
      risk: "safe",
      description: "List current __FEDERATION__.__INSTANCES__ entries.",
      handler: () => {
        const instances = reportReader.getRuntimeState().instances;
        return {
          count: instances.length,
          instances
        };
      }
    });
    runtime.registerAction({
      name: "mf:get-federation-instance-config",
      source,
      risk: "safe",
      description: "Get one __FEDERATION__.__INSTANCES__ config.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            description: "Instance name."
          },
          instanceRef: {
            type: "string",
            description: "Stable observability instance reference."
          },
          index: {
            type: "number",
            description: "Unstable compatibility index in __INSTANCES__."
          }
        }
      },
      handler: (payload) => getFederationInstanceConfigActionResult(payload, reportReader.getRuntimeState())
    });
    registeredActionRuntimes.add(runtime);
  }
  function listReports(reportReader, payload) {
    const query = getReportQuery(payload);
    const reports = hasReportQueryFilter(query) ? reportReader.findReports(query) : reportReader.getReports({ limit: query.limit });
    return {
      count: reports.length,
      reports: reports.map(createReportSummary)
    };
  }
  function getReportQuery(payload) {
    const query = {};
    const limit = getPayloadNumber(payload, "limit");
    const traceId = getPayloadString(payload, "traceId");
    const instanceRef = getPayloadString(payload, "instanceRef");
    const remote = getPayloadString(payload, "remote");
    const expose = getPayloadString(payload, "expose");
    const shared = getPayloadString(payload, "shared");
    const status = getPayloadReportStatus(payload, "status");
    const outcome = getPayloadReportOutcome(payload, "outcome");
    if (limit !== void 0) query.limit = limit;
    if (traceId !== void 0) query.traceId = traceId;
    if (instanceRef !== void 0) query.instanceRef = instanceRef;
    if (remote !== void 0) query.remote = remote;
    if (expose !== void 0) query.expose = expose;
    if (shared !== void 0) query.shared = shared;
    if (status !== void 0) query.status = status;
    if (outcome !== void 0) query.outcome = outcome;
    return query;
  }
  function hasReportQueryFilter(query) {
    return query.traceId !== void 0 || query.instanceRef !== void 0 || query.remote !== void 0 || query.expose !== void 0 || query.shared !== void 0 || query.status !== void 0 || query.outcome !== void 0;
  }
  function createReportSummary(report) {
    return compactObject$1({
      traceId: report.traceId,
      instanceRef: report.instanceRef,
      status: report.status,
      requestId: report.requestId,
      requestAlias: report.requestAlias,
      hostName: report.hostName,
      runtimeVersion: report.runtimeVersion,
      remote: report.remote,
      expose: report.expose,
      shared: report.shared,
      startedAt: report.startedAt,
      updatedAt: report.updatedAt,
      duration: report.duration,
      outcome: report.summary.outcome,
      lastPhase: report.summary.lastPhase,
      eventCount: report.summary.eventCount,
      failedPhase: report.failedPhase,
      errorCode: report.errorCode,
      errorMessage: report.errorMessage
    });
  }
  function getFederationGlobalSummary(runtimeState) {
    return {
      available: true,
      schemaVersion: runtimeState.schemaVersion,
      observedAt: runtimeState.observedAt,
      scope: runtimeState.scope,
      completeness: runtimeState.completeness,
      capabilities: runtimeState.capabilities,
      moduleInfoCount: runtimeState.moduleInfo.length,
      moduleInfoKeys: runtimeState.moduleInfo.map((entry) => entry.key),
      instanceCount: runtimeState.instances.length,
      instances: runtimeState.instances,
      relationshipCount: runtimeState.relationships.length
    };
  }
  function getFederationModuleInfoActionResult(payload, runtimeState) {
    const key = getPayloadString(payload, "key") || getPayloadString(payload, "name");
    const instanceRef = getPayloadString(payload, "instanceRef");
    const instance = instanceRef ? runtimeState.instances.find((candidate) => candidate.instanceRef === instanceRef) : void 0;
    if (instanceRef && !instance) return {
      available: true,
      found: false,
      instanceRef,
      instances: runtimeState.instances.map(createInstanceCandidate)
    };
    const matched = key ? runtimeState.moduleInfo.find((entry) => entry.key === key || entry.name === key) : void 0;
    return key ? compactObject$1({
      available: true,
      found: matched !== void 0,
      key,
      instance: instance ? createInstanceCandidate(instance) : void 0,
      relationships: instance ? runtimeState.relationships.filter((relationship) => relationship.consumerInstanceRef === instance.instanceRef) : void 0,
      moduleInfo: matched
    }) : compactObject$1({
      available: true,
      keys: runtimeState.moduleInfo.map((entry) => entry.key),
      instance: instance ? createInstanceCandidate(instance) : void 0,
      relationships: instance ? runtimeState.relationships.filter((relationship) => relationship.consumerInstanceRef === instance.instanceRef) : void 0,
      moduleInfo: runtimeState.moduleInfo
    });
  }
  function getFederationInstanceConfigActionResult(payload, runtimeState) {
    const instanceRef = getPayloadString(payload, "instanceRef");
    const name = getPayloadString(payload, "name");
    const index = getPayloadNumber(payload, "index");
    const nameMatches = name ? runtimeState.instances.filter((instance2) => instance2.name === name || instance2.optionsName === name) : [];
    const instance = instanceRef ? runtimeState.instances.find((candidate) => candidate.instanceRef === instanceRef) : nameMatches.length === 1 ? nameMatches[0] : index !== void 0 ? runtimeState.instances[index] : void 0;
    if (!instance) return {
      found: false,
      instanceRef,
      name,
      index,
      unstableIndex: index !== void 0 || void 0,
      candidates: nameMatches.length > 1 ? nameMatches.map(createInstanceCandidate) : void 0,
      instances: runtimeState.instances.map(createInstanceCandidate)
    };
    return {
      found: true,
      unstableIndex: index !== void 0 || void 0,
      instance
    };
  }
  function createInstanceCandidate(instance) {
    return compactObject$1({
      instanceRef: instance.instanceRef,
      name: instance.name,
      optionsName: instance.optionsName,
      optionsVersion: instance.optionsVersion,
      runtimeVersion: instance.runtimeVersion,
      role: instance.role,
      active: instance.active
    });
  }
  function getPayloadString(payload, key) {
    const value = getRecordProperty(asRecord(payload), key);
    return typeof value === "string" && value ? value : void 0;
  }
  function getPayloadNumber(payload, key) {
    const value = getRecordProperty(asRecord(payload), key);
    return typeof value === "number" && Number.isFinite(value) ? value : void 0;
  }
  function getPayloadReportStatus(payload, key) {
    const value = getPayloadString(payload, key);
    return value && isReportStatus(value) ? value : void 0;
  }
  function getPayloadReportOutcome(payload, key) {
    const value = getPayloadString(payload, key);
    return value && isReportOutcome(value) ? value : void 0;
  }
  function isReportStatus(value) {
    return reportStatuses.includes(value);
  }
  function isReportOutcome(value) {
    return reportOutcomes.includes(value);
  }
  function asRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    return value;
  }
  function getRecordProperty(record, key) {
    return record ? record[key] : void 0;
  }
  function compactObject$1(input) {
    const output = {};
    Object.entries(input).forEach(([key, value]) => {
      if (value !== void 0) output[key] = value;
    });
    return output;
  }
  var divebellSource = "module-federation";
  var loadingStatuses = [
    "registered",
    "loading",
    "ready",
    "error",
    "recovered"
  ];
  var sharedStatuses = [
    "unloaded",
    "loading",
    "loaded",
    "recovered",
    "error"
  ];
  var sharedConflictStatuses = ["warning"];
  var remoteLifecyclePhases = /* @__PURE__ */ new Set([
    "matchRemote",
    "manifest",
    "remoteEntry",
    "remoteEntryInit",
    "loadRemote",
    "preload"
  ]);
  var remoteFailurePhases = /* @__PURE__ */ new Set([
    "matchRemote",
    "manifest",
    "remoteEntry",
    "remoteEntryInit",
    "loadRemote"
  ]);
  function createDivebellObservabilityAdapter(input, reportReader) {
    if (!input) return;
    const options = input === true ? {} : input;
    if (options.enabled === false) return;
    const registeredActionRuntimes = /* @__PURE__ */ new WeakSet();
    let createdRuntime;
    const getRuntime = () => {
      if (options.runtime) return options.runtime;
      const host = options.host || getDefaultHost();
      const runtime = getDivebellFromWindow(host);
      if (runtime) return runtime;
      if (!createdRuntime) {
        const nextRuntime = createDivebell();
        createdRuntime = host ? installDivebellOnWindow(nextRuntime, host) : nextRuntime;
      }
      return createdRuntime;
    };
    const prepareRuntime = () => {
      const runtime = getRuntime();
      const source = options.source || divebellSource;
      registerDivebellActions(runtime, source, reportReader, registeredActionRuntimes);
      return {
        runtime,
        source
      };
    };
    return {
      register() {
        try {
          prepareRuntime();
        } catch {
        }
      },
      syncReport(report) {
        try {
          const { runtime, source } = prepareRuntime();
          syncReportToDivebell(runtime, source, report, reportReader);
        } catch {
        }
      }
    };
  }
  function syncReportToDivebell(runtime, source, report, reportReader) {
    if (report.remote) {
      syncRemote(runtime, source, report, reportReader);
      syncRemoteModule(runtime, source, report, reportReader);
    }
    if (report.shared) {
      syncShared(runtime, source, report);
      syncSharedConflict(runtime, source, report);
    }
  }
  function syncRemote(runtime, source, report, reportReader) {
    const remote = report.remote;
    if (!remote?.name) return;
    const targetId = targetIds.remote(remote.name);
    const remoteReports = getRemoteReports(report, remote, reportReader);
    const remoteStatus = getRemoteStatus(remoteReports);
    const remoteData = getRemoteTargetData(remote, remoteReports);
    runtime.registerTarget({
      id: targetId,
      type: targetTypes.remote,
      source,
      label: `MF remote ${remote.name}`,
      description: "Module Federation remote loading state.",
      statuses: loadingStatuses,
      data: remoteData
    });
    runtime.updateSnapshot({
      id: targetId,
      status: remoteStatus,
      source,
      data: remoteData,
      error: getRemoteError(remoteReports, remoteStatus)
    });
  }
  function syncRemoteModule(runtime, source, report, reportReader) {
    const remote = report.remote;
    if (!remote?.name || !report.expose) return;
    const targetId = targetIds.remoteModule(remote.name, report.expose);
    const remoteModuleReports = getRemoteModuleReports(report, remote, report.expose, reportReader);
    const latestReport = remoteModuleReports[0] || report;
    const remoteModuleData = getRemoteModuleTargetData(latestReport, remoteModuleReports);
    runtime.registerTarget({
      id: targetId,
      type: targetTypes.remoteModule,
      source,
      label: `MF remote module ${remote.name}/${normalizeExpose(report.expose)}`,
      description: "Module Federation exposed module loading state.",
      statuses: loadingStatuses,
      data: remoteModuleData
    });
    runtime.updateSnapshot({
      id: targetId,
      status: getRemoteModuleStatus(latestReport),
      source,
      data: remoteModuleData,
      error: getReportError(latestReport),
      dependsOn: getRemoteModuleDependsOn(remote.name)
    });
  }
  function syncShared(runtime, source, report) {
    const shared = report.shared;
    if (!shared?.name) return;
    const targetId = targetIds.shared(shared);
    runtime.registerTarget({
      id: targetId,
      type: targetTypes.shared,
      source,
      label: `MF shared ${shared.name}`,
      description: "Module Federation shared dependency loading state.",
      statuses: sharedStatuses,
      data: getSharedTargetData(report, shared)
    });
    runtime.updateSnapshot({
      id: targetId,
      status: getSharedStatus(report),
      source,
      data: getSharedTargetData(report, shared),
      error: getReportError(report)
    });
  }
  function syncSharedConflict(runtime, source, report) {
    const shared = report.shared;
    if (!shared?.name || shared.reason !== "singleton-multiple-versions") return;
    const targetId = targetIds.sharedConflict(shared);
    const data = getSharedConflictTargetData(report, shared);
    runtime.registerTarget({
      id: targetId,
      type: targetTypes.sharedConflict,
      source,
      label: `MF shared conflict ${shared.name}`,
      description: "Module Federation singleton shared dependency version conflict.",
      statuses: sharedConflictStatuses,
      data
    });
    runtime.updateSnapshot({
      id: targetId,
      status: "warning",
      source,
      data
    });
  }
  function getRemoteTargetData(remote, reports) {
    const latestReport = reports[0];
    const exposes = getRemoteExposeData(remote.name, reports);
    return compactObject({
      instanceRef: latestReport?.instanceRef,
      hostName: getReportHostNames(reports),
      runtimeVersion: latestReport?.runtimeVersion,
      remote: getLatestRemoteInfo(remote, reports),
      exposes: exposes.length > 0 ? exposes : void 0,
      reportCount: reports.length
    });
  }
  function getRemoteModuleTargetData(report, reports) {
    const hostNames = getReportHostNames(reports, report.expose);
    return compactObject({
      instanceRef: report.instanceRef,
      traceId: report.traceId,
      requestId: report.requestId,
      requestAlias: report.requestAlias,
      hostName: hostNames,
      runtimeVersion: report.runtimeVersion,
      consumers: hostNames,
      lastPhase: report.summary.lastPhase,
      phases: report.summary.phases,
      loadedBefore: report.loadedBefore
    });
  }
  function getSharedTargetData(report, shared) {
    return compactObject({
      instanceRef: report.instanceRef,
      traceId: report.traceId,
      requestId: report.requestId,
      hostName: report.hostName,
      runtimeVersion: report.runtimeVersion,
      shared: getSharedSnapshotData(shared),
      lastPhase: report.summary.lastPhase,
      phases: report.summary.phases
    });
  }
  function getSharedConflictTargetData(report, shared) {
    const conflict = shared.conflict;
    return compactObject({
      instanceRef: report.instanceRef,
      traceId: report.traceId,
      requestId: report.requestId,
      hostName: report.hostName,
      runtimeVersion: report.runtimeVersion,
      reason: shared.reason,
      sharedName: shared.name,
      scope: conflict?.scope || getSharedTargetScope(shared),
      singleton: shared.singleton,
      currentVersion: conflict?.currentVersion || getSharedTargetVersion(shared),
      currentFrom: conflict?.currentFrom || shared.provider,
      versions: conflict?.versions || shared.availableVersions,
      existingVersions: conflict?.existingVersions,
      shared: getSharedSnapshotData(shared)
    });
  }
  function getSharedSnapshotData(shared) {
    return compactObject({
      name: shared.name,
      shareScope: shared.shareScope,
      version: getSharedTargetVersion(shared),
      requiredVersion: shared.requiredVersion,
      provider: shared.provider,
      singleton: shared.singleton,
      strictVersion: shared.strictVersion,
      eager: shared.eager,
      strategy: shared.strategy,
      loaded: shared.loaded,
      loading: shared.loaded ? void 0 : shared.loading,
      reason: shared.reason,
      definedBy: shared.definedBy,
      conflict: shared.conflict
    });
  }
  function getRemoteStatus(reports) {
    const phaseRecord = getLatestRemotePhaseRecord(reports);
    if (!phaseRecord) return "loading";
    const failedPhase = getFailedPhase(phaseRecord.report);
    if (failedPhase && remoteFailurePhases.has(failedPhase) && failedPhase === phaseRecord.phaseName) return phaseRecord.report.summary.recovered ? "recovered" : "error";
    const phase = phaseRecord.report.summary.phases[phaseRecord.phaseName];
    if (phase) return mapPhaseStatus(phase);
    return mapEventStatus(phaseRecord.event.status);
  }
  function getRemoteExposeData(remoteName, reports) {
    const reportsByExpose = /* @__PURE__ */ new Map();
    reports.forEach((report) => {
      const expose = getReportExpose(report);
      const exposeKey = expose ? normalizeExpose(expose) : "";
      if (!expose || reportsByExpose.has(exposeKey)) return;
      reportsByExpose.set(exposeKey, report);
    });
    return Array.from(reportsByExpose.values()).map((report) => compactObject({ targetId: targetIds.remoteModule(remoteName, getReportExpose(report) || "") })).filter((item) => item["targetId"] !== void 0).sort((left, right) => String(left["targetId"] || "").localeCompare(String(right["targetId"] || "")));
  }
  function getRemoteModuleStatus(report) {
    if (report.status === "error") return "error";
    if (report.summary.recovered) return "recovered";
    if (report.summary.componentLoaded || report.summary.runtimeLoaded) return "ready";
    return getPhaseTargetStatus(report, "moduleFactory") || getPhaseTargetStatus(report, "expose") || "loading";
  }
  function getSharedStatus(report) {
    const sharedPhaseStatus = report.summary.phases["shared"]?.status;
    if (report.status === "error" || sharedPhaseStatus === "error") return "error";
    if (report.summary.recovered) return "recovered";
    if (report.shared?.loaded || report.summary.sharedResolved) return "loaded";
    if (report.shared?.loading) return "loading";
    if (sharedPhaseStatus === "start") return "loading";
    return "unloaded";
  }
  function getPhaseTargetStatus(report, phase) {
    const summary = report.summary.phases[phase];
    if (!summary) return;
    if (summary.recovered) return "recovered";
    return mapPhaseStatus(summary);
  }
  function mapPhaseStatus(summary) {
    if (summary.status === "start") return "loading";
    if (summary.status === "error") return "error";
    if (summary.status === "success" || summary.status === "complete") return "ready";
    return "registered";
  }
  function mapEventStatus(status) {
    if (status === "start") return "loading";
    if (status === "error") return "error";
    if (status === "success" || status === "complete") return "ready";
    return "registered";
  }
  function getReportError(report) {
    const error = report.summary.error;
    if (!error && report.status !== "error") return;
    const runtimeError = { message: error?.errorMessage || report.errorMessage || "MF loading failed." };
    const code = error?.errorCode || report.errorCode;
    const data = compactObject({
      traceId: report.traceId,
      failedPhase: error?.failedPhase || report.failedPhase,
      lifecycle: error?.lifecycle,
      ownerHint: error?.ownerHint,
      retryable: error?.retryable,
      context: error?.context || report.errorContext
    });
    if (code) runtimeError.code = code;
    if (report.errorStack) runtimeError.stack = report.errorStack;
    if (Object.keys(data).length > 0) runtimeError.data = data;
    return runtimeError;
  }
  function getRemoteError(reports, status) {
    if (status !== "error") return;
    const failedReport = reports.find((report) => isRemoteFailureReport(report));
    return failedReport ? getReportError(failedReport) : void 0;
  }
  function getRemoteModuleDependsOn(remoteName) {
    return [targetIds.remote(remoteName)];
  }
  function getRemoteReports(currentReport, remote, reportReader) {
    const reports = reportReader ? reportReader.getReports().filter((report) => isSameRemoteReport(report, remote)) : [];
    if (!reports.some((report) => report.traceId === currentReport.traceId)) reports.unshift(currentReport);
    return Array.from(new Map(reports.map((report) => [report.traceId, report])).values()).sort(compareReportsByTime);
  }
  function getRemoteModuleReports(currentReport, remote, expose, reportReader) {
    const reports = getRemoteReports(currentReport, remote, reportReader).filter((report) => isSameExposeReport(report, expose));
    if (!reports.some((report) => report.traceId === currentReport.traceId)) reports.unshift(currentReport);
    return Array.from(new Map(reports.map((report) => [report.traceId, report])).values()).sort(compareReportsByTime);
  }
  function getLatestRemoteInfo(fallback, reports) {
    return reports.find((report) => report.remote)?.remote || fallback;
  }
  function isSameRemoteReport(report, remote) {
    if (!report.remote) return false;
    const expected = new Set([
      remote.name,
      remote.alias,
      remote.entry
    ].filter((value) => value !== void 0));
    return [
      report.remote.name,
      report.remote.alias,
      report.remote.entry
    ].some((value) => value !== void 0 && expected.has(value));
  }
  function isSameExposeReport(report, expose) {
    const reportExpose = getReportExpose(report);
    if (!reportExpose) return false;
    return normalizeExpose(reportExpose) === normalizeExpose(expose);
  }
  function getReportHostNames(reports, expose) {
    const hostNames = [];
    const seen = /* @__PURE__ */ new Set();
    const addHostName = (hostName) => {
      if (!isNonEmptyString(hostName) || seen.has(hostName)) return;
      seen.add(hostName);
      hostNames.push(hostName);
    };
    reports.forEach((report) => {
      addHostName(report.hostName);
      report.loadedBefore?.consumers.forEach((consumer) => {
        if (expose && !hasLoadedExpose(consumer.exposes, expose)) return;
        addHostName(consumer.name);
      });
    });
    return hostNames.length > 0 ? hostNames : void 0;
  }
  function hasLoadedExpose(loadedExposes, expose) {
    return Boolean(loadedExposes?.some((loadedExpose) => normalizeExpose(loadedExpose) === normalizeExpose(expose)));
  }
  function compareReportsByTime(left, right) {
    if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
    return right.startedAt - left.startedAt;
  }
  function getLatestRemotePhaseRecord(reports) {
    return reports.flatMap((report) => report.events.filter((event) => remoteLifecyclePhases.has(event.phase)).map((event) => ({
      report,
      event,
      phaseName: event.phase
    }))).sort((left, right) => right.event.timestamp - left.event.timestamp)[0];
  }
  function isRemoteFailureReport(report) {
    const failedPhase = getFailedPhase(report);
    return failedPhase !== void 0 && remoteFailurePhases.has(failedPhase);
  }
  function getFailedPhase(report) {
    return report.summary.error?.failedPhase || report.failedPhase;
  }
  function getExposeFromRequestId(requestId) {
    if (!requestId) return;
    const separatorIndex = requestId.indexOf("/");
    if (separatorIndex < 0 || separatorIndex === requestId.length - 1) return;
    return requestId.slice(separatorIndex + 1);
  }
  function getReportExpose(report) {
    return report.expose || getExposeFromRequestId(report.requestId);
  }
  function compactObject(input) {
    const output = {};
    Object.entries(input).forEach(([key, value]) => {
      if (value !== void 0) output[key] = value;
    });
    return output;
  }
  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
  }
  function getDefaultHost() {
    if (typeof window === "undefined") return;
    return window;
  }
  function normalizeSegment(value) {
    return value.trim().replace(/\s+/g, "_") || "unknown";
  }
  function normalizeExpose(value) {
    return normalizeSegment(value.replace(/^\.\//, ""));
  }
  var targetTypes = {
    remote: "mf.remote",
    remoteModule: "mf.remote.expose",
    shared: "mf.shared",
    sharedConflict: "mf.shared.conflict"
  };
  var targetIds = {
    remote(remoteName) {
      return `mf:remote:${normalizeSegment(remoteName)}`;
    },
    remoteModule(remoteName, expose) {
      return `${targetIds.remote(remoteName)}:expose:${normalizeExpose(expose)}`;
    },
    shared(shared) {
      return `mf:shared:${normalizeSegment(shared.name)}:${normalizeSegment(getSharedTargetVersion(shared))}:${normalizeSegment(getSharedTargetScope(shared))}`;
    },
    sharedConflict(shared) {
      return `mf:shared-conflict:${normalizeSegment(shared.name)}:${normalizeSegment(getSharedTargetScope(shared))}`;
    }
  };
  function getSharedTargetVersion(shared) {
    const requiredVersion = typeof shared.requiredVersion === "string" ? shared.requiredVersion : "";
    return shared.selectedVersion || shared.version || requiredVersion || "unknown";
  }
  function getSharedTargetScope(shared) {
    return shared.shareScope?.length ? shared.shareScope.join("_") : "default";
  }
  var DEFAULT_MAX_EVENTS = 100;
  var HARD_MAX_EVENTS = 1e3;
  var DEFAULT_COLLECTOR_PORT = 17891;
  var COLLECTOR_PATH = "/__mf_observability";
  var logger2 = createLogger("[ Module Federation Observability Plugin ]");
  var DEFAULT_DEVTOOLS_SOURCE = "module-federation/observability";
  var COMPONENT_BUSINESS_LOADED_EVENT = "component:business-loaded";
  var ON_MF_REMOTE_LOADED_PROP = "onMFRemoteLoaded";
  var SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON = "singleton-multiple-versions";
  var SENSITIVE_PAIR_PATTERN = /\b(token|authorization|cookie|secret|password|session|access_token|refresh_token|api_key|apikey|key)\s*[:=]\s*([^&\s'",;<>]+)/gi;
  var ERROR_CODE_PATTERN = /\b(?:RUNTIME|TYPE|BUILD)-\d{3}\b/;
  var URL_PATTERN = /https?:\/\/[^\s'"<>]+/g;
  var DIAGNOSTIC_DOC_LINK_PATTERN = /https?:\/\/module-federation\.io\/guide\/troubleshooting\/[^\s'"<>]+/i;
  var RUNTIME_DOC_LINK = "https://module-federation.io/guide/troubleshooting/runtime";
  var MAX_METADATA_KEYS = 20;
  var MAX_FACT_KEYS = 50;
  var MAX_MODULE_INFO_ENTRIES = 20;
  var HARD_MAX_REPORT_QUERY_LIMIT = 1e3;
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function normalizeMaxEvents(value, fallback) {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.max(1, Math.min(HARD_MAX_EVENTS, Math.floor(value)));
  }
  function normalizeQueryLimit(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    return Math.max(1, Math.min(HARD_MAX_REPORT_QUERY_LIMIT, Math.floor(value)));
  }
  function normalizeCollectorPort(value) {
    if (!Number.isFinite(value) || !value) return DEFAULT_COLLECTOR_PORT;
    const port = Math.floor(value);
    return port > 0 && port <= 65535 ? port : DEFAULT_COLLECTOR_PORT;
  }
  function normalizeCollectorOptions(value) {
    if (value === true) return {
      enabled: true,
      port: DEFAULT_COLLECTOR_PORT
    };
    if (!value || value.enabled === false) return;
    return {
      enabled: true,
      port: normalizeCollectorPort(value.port)
    };
  }
  function normalizeDevtoolsOptions(value) {
    if (value === true) return {
      enabled: true,
      source: DEFAULT_DEVTOOLS_SOURCE
    };
    if (!value || value.enabled === false) return;
    return {
      enabled: true,
      source: sanitizeText(value.source, 160) || DEFAULT_DEVTOOLS_SOURCE
    };
  }
  function getCollectorUrl(port) {
    return `http://127.0.0.1:${port}${COLLECTOR_PATH}`;
  }
  function sanitizeText(value, maxLength = 800) {
    if (value === void 0 || value === null) return;
    const sanitized = String(value).replace(URL_PATTERN, (url) => sanitizeUrl(url) || "[redacted-url]").replace(SENSITIVE_PAIR_PATTERN, "[redacted]");
    return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength)}...` : sanitized;
  }
  function getRawText(value) {
    if (value === void 0 || value === null) return;
    return String(value);
  }
  function clipText(value, maxLength = 320) {
    if (value === void 0 || value === null) return;
    const sanitized = String(value);
    return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength)}...` : sanitized;
  }
  function clipObservabilityMetadata(metadata, maxKeys = MAX_METADATA_KEYS) {
    if (!metadata || typeof metadata !== "object") return;
    const clipped = {};
    Object.entries(metadata).slice(0, maxKeys).forEach(([rawKey, rawValue]) => {
      const key = clipText(rawKey, 80);
      if (!key || rawValue === void 0 || rawValue === null) return;
      if (typeof rawValue === "boolean") {
        clipped[key] = rawValue;
        return;
      }
      if (typeof rawValue === "number") {
        if (Number.isFinite(rawValue)) clipped[key] = rawValue;
        return;
      }
      const value = clipText(rawValue, 240);
      if (value) clipped[key] = value;
    });
    return Object.keys(clipped).length ? clipped : void 0;
  }
  function clipMetadata(metadata, maxKeys = MAX_METADATA_KEYS) {
    if (!metadata || typeof metadata !== "object") return;
    const clipped = {};
    Object.entries(metadata).slice(0, maxKeys).forEach(([rawKey, rawValue]) => {
      const key = sanitizeText(rawKey, 80);
      if (!key || rawValue === void 0 || rawValue === null) return;
      if (typeof rawValue === "boolean") {
        clipped[key] = rawValue;
        return;
      }
      if (typeof rawValue === "number") {
        if (Number.isFinite(rawValue)) clipped[key] = rawValue;
        return;
      }
      const value = clipText(rawValue, 240);
      if (value) clipped[key] = value;
    });
    return Object.keys(clipped).length ? clipped : void 0;
  }
  function sanitizeStack(stack, options) {
    if (!stack || options?.enabled === false) return;
    return stack;
  }
  function getRawStack(error) {
    if (error instanceof Error) return error.stack || error.message;
  }
  function sanitizeRequestId(value) {
    if (!value) return;
    return clipText(value, 240);
  }
  function sanitizeUrl(value) {
    if (!value) return;
    try {
      const base = typeof window !== "undefined" && window.location ? window.location.origin : "http://localhost";
      const parsedUrl = new URL(value, base);
      const sanitized = `${parsedUrl.origin}${parsedUrl.pathname}`;
      return /^https?:\/\//i.test(value) ? sanitized : parsedUrl.pathname;
    } catch {
      const [withoutHash] = value.split("#");
      const [withoutQuery] = withoutHash.split("?");
      return sanitizeText(withoutQuery, 240);
    }
  }
  function getObjectValue(value, key) {
    return value[key];
  }
  function omitUndefinedFields(value) {
    if (Array.isArray(value)) return value.map((item) => omitUndefinedFields(item));
    if (!value || typeof value !== "object") return value;
    const cleanValue = {};
    Object.entries(value).forEach(([key, item]) => {
      if (item === void 0) return;
      cleanValue[key] = omitUndefinedFields(item);
    });
    return cleanValue;
  }
  function sanitizeRemote(remote) {
    if (!remote || !remote.name) return;
    return {
      name: remote.name,
      alias: sanitizeText(remote.alias, 120),
      entry: clipText(remote.entry, 320),
      entryGlobalName: sanitizeText(remote.entryGlobalName, 120),
      type: sanitizeText(remote.type, 80)
    };
  }
  function sanitizeResource(resource) {
    if (!resource) return;
    const type = sanitizeText(resource.type, 80);
    if (!type) return;
    return omitUndefinedFields({
      type,
      initiator: resource.initiator,
      outcome: resource.outcome,
      url: sanitizeUrl(resource.url),
      startedAt: Number.isFinite(resource.startedAt) ? resource.startedAt : Date.now(),
      endedAt: resource.endedAt !== void 0 && Number.isFinite(resource.endedAt) ? resource.endedAt : void 0,
      duration: resource.duration !== void 0 && Number.isFinite(resource.duration) ? Math.max(0, resource.duration) : void 0,
      httpStatus: resource.httpStatus !== void 0 && Number.isFinite(resource.httpStatus) ? resource.httpStatus : void 0,
      mimeType: sanitizeText(resource.mimeType, 160),
      redirected: typeof resource.redirected === "boolean" ? resource.redirected : void 0,
      cacheSource: sanitizeText(resource.cacheSource, 80),
      errorType: sanitizeText(resource.errorType, 80)
    });
  }
  function createRemoteInfo(remote) {
    if (!remote?.name) return;
    return {
      name: remote.name,
      alias: remote.alias,
      entry: remote.entry,
      entryGlobalName: remote.entryGlobalName,
      type: remote.type
    };
  }
  function isManifestUrl(value) {
    const sanitized = sanitizeUrl(value);
    return Boolean(sanitized && /manifest.*\.json$/i.test(sanitized));
  }
  function normalizeEventSource(value) {
    return value === "runtime" || value === "business" || value === "react" ? value : void 0;
  }
  function extractErrorCode(value) {
    const matched = String(value ?? "").match(ERROR_CODE_PATTERN)?.[0];
    return matched ? sanitizeText(matched, 40) : void 0;
  }
  function getErrorInfo(error, stackTraceOptions) {
    if (!error) return {};
    if (error instanceof Error) return {
      errorCode: extractErrorCode(`${error.name}
${error.message}
${error.stack || ""}`),
      errorName: getRawText(error.name),
      errorMessage: getRawText(error.message),
      errorStack: sanitizeStack(error.stack, stackTraceOptions)
    };
    if (isRecord(error) && typeof error.message === "string") return {
      errorCode: extractErrorCode(error.message),
      errorName: typeof error.name === "string" ? getRawText(error.name) : void 0,
      errorMessage: getRawText(error.message)
    };
    return {
      errorCode: extractErrorCode(error),
      errorMessage: getRawText(error)
    };
  }
  function classifyResourceLoadError(resource) {
    if (resource.outcome === "timeout") return "timeout";
    if (typeof resource.httpStatus === "number" && resource.httpStatus >= 400) return "http";
    const errorInfo = getErrorInfo(resource.error);
    const value = `${errorInfo.errorName || ""} ${errorInfo.errorMessage || ""}`.trim();
    if (!value) return resource.outcome === "error" ? "unknown" : void 0;
    if (/timeout|timed out/i.test(value)) return "timeout";
    if (/ScriptExecutionError/i.test(value)) return "execution";
    if (/ScriptNetworkError|LinkNetworkError|NetworkError|Failed to fetch|Request failed|ERR_|CORS|ENOENT|unreachable/i.test(value)) return "network";
    if (/RUNTIME-001|global.+not found|not found.+global/i.test(value)) return "initialization";
    if (errorInfo.errorName === "SyntaxError" || /valid federation manifest|JSON|Unexpected token/i.test(value)) return "content";
    return resource.outcome === "error" ? "unknown" : void 0;
  }
  function getRuntimeSharedVersionEntries(value) {
    if (!isRecord(value) || Array.isArray(value)) return [];
    return Object.entries(value).filter((entry) => isRecord(entry[1]) && !Array.isArray(entry[1]));
  }
  function normalizeSharedScope(value) {
    if (!value) return [];
    return (Array.isArray(value) ? value : [value]).map((scope) => sanitizeText(scope, 120)).filter((scope) => Boolean(scope));
  }
  function getSharedScopes(shareInfo) {
    return normalizeSharedScope(shareInfo?.scope).length ? normalizeSharedScope(shareInfo?.scope) : ["default"];
  }
  function getAvailableSharedVersions(args) {
    const versions = /* @__PURE__ */ new Set();
    const shareScopeMap = args.shareScopeMap || {};
    getSharedScopes(args.shareInfo).forEach((scope) => {
      Object.keys(shareScopeMap[scope]?.[args.pkgName] || {}).forEach((version) => {
        versions.add(version);
      });
    });
    return Array.from(versions);
  }
  function getOriginShareScopeMap(origin) {
    return origin.shareScopeMap || origin.sharedHandler?.shareScopeMap || {};
  }
  function getSharedVersion(value) {
    return sanitizeText(value?.version, 120);
  }
  function isSingletonShared(value) {
    return value?.shareConfig?.singleton === true;
  }
  function createSharedConflictVersion(version, shared) {
    return {
      version,
      from: sanitizeText(shared?.from, 160),
      singleton: isSingletonShared(shared) || void 0,
      loaded: shared?.loaded === true || void 0
    };
  }
  function createSharedSingletonConflict(args) {
    const currentVersion = getSharedVersion(args.shared);
    if (!currentVersion) return;
    const existingVersionMap = args.shareScopeMap[args.scope]?.[args.pkgName] || {};
    const existingVersions = Object.entries(existingVersionMap).map(([version, shared]) => createSharedConflictVersion(sanitizeText(version, 120) || version, shared)).filter((item) => item.version && item.version !== currentVersion);
    if (!existingVersions.length) return;
    if (!(isSingletonShared(args.shared) || existingVersions.some((item) => item.singleton === true))) return;
    const versions = Array.from(/* @__PURE__ */ new Set([currentVersion, ...existingVersions.map((item) => item.version)])).sort();
    if (versions.length <= 1) return;
    return {
      reason: SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON,
      scope: args.scope,
      currentVersion,
      currentFrom: sanitizeText(args.shared.from, 160),
      versions,
      existingVersions
    };
  }
  function createSharedConflictInfo(args) {
    const shareConfig = args.shared.shareConfig;
    return {
      name: args.pkgName,
      shareScope: [args.conflict.scope],
      version: args.conflict.currentVersion || args.shared.version,
      requiredVersion: shareConfig?.requiredVersion,
      availableVersions: args.conflict.versions,
      provider: args.conflict.currentFrom,
      useIn: args.shared.useIn,
      singleton: true,
      strictVersion: shareConfig?.strictVersion,
      eager: shareConfig?.eager,
      strategy: args.shared.strategy,
      loaded: args.shared.loaded,
      loading: args.shared.loaded ? void 0 : Boolean(args.shared.loading) || void 0,
      reason: SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON,
      conflict: args.conflict
    };
  }
  function getSharedConflictKey(args) {
    return [
      args.hostName || "unknown",
      args.pkgName,
      args.conflict.scope,
      args.conflict.versions.join(",")
    ].join("|");
  }
  function getSharedUseIn(args) {
    const useIn = [
      ...args.selectedShared?.useIn || [],
      ...args.shareInfo?.useIn || [],
      args.origin.options?.name || args.origin.name
    ].map((consumer) => sanitizeText(consumer, 160)).filter((consumer) => Boolean(consumer));
    return Array.from(new Set(useIn));
  }
  function getSharedMissReason(args) {
    if (!args.shareInfo) return "missing-config";
    return getAvailableSharedVersions(args).length ? "version-mismatch" : "missing-provider";
  }
  function getSharedErrorReason(args) {
    if (args.recovered) return getSharedMissReason(args);
    const errorMessage = getErrorInfo(args.error, { enabled: false }).errorMessage || "";
    if (!args.shareInfo || /Cannot find shared/i.test(errorMessage)) return "missing-config";
    if (args.lifecycle === "loadShareSync" && typeof args.shareInfo.get === "function" && /RUNTIME-00[56]/.test(errorMessage)) return "sync-async-boundary";
    if (args.lifecycle === "loadShareSync" && !args.shareInfo.get && /RUNTIME-006/.test(errorMessage)) return getSharedMissReason(args);
    if (args.error) return "load-error";
  }
  function parseStableVersion(version) {
    const matched = version?.match(/^(\d+)\.(\d+)\.(\d+)(?:\+[\w.-]+)?$/);
    if (!matched) return;
    return {
      major: Number(matched[1]),
      minor: Number(matched[2]),
      patch: Number(matched[3])
    };
  }
  function isVersionAtLeast(version, target) {
    if (version.major !== target.major) return version.major > target.major;
    if (version.minor !== target.minor) return version.minor > target.minor;
    return version.patch >= target.patch;
  }
  function supportsRuntimeObservability(origin) {
    const version = parseStableVersion(origin?.version);
    if (!version) return false;
    return isVersionAtLeast(version, {
      major: 2,
      minor: 5,
      patch: 0
    });
  }
  function isRuntimeSharedLoaded(shared) {
    return shared?.loaded === true || shared?.treeShaking?.loaded === true || typeof shared?.get === "function" && shared.loaded === true;
  }
  function isRuntimeSharedLoading(shared) {
    return !isRuntimeSharedLoaded(shared) && Boolean(shared?.loading || shared?.treeShaking?.loading);
  }
  function getRuntimeSharedCompatibility(version, requiredVersion) {
    if (requiredVersion === void 0) return;
    if (requiredVersion === false || requiredVersion === "*") return true;
    try {
      return (0, import_semver.satisfies)(version, requiredVersion, { includePrerelease: true });
    } catch {
      return false;
    }
  }
  function createRuntimeSharedCandidate(scope, version, shared, requiredVersion) {
    const compatible = getRuntimeSharedCompatibility(version, requiredVersion);
    return {
      scope,
      version,
      provider: shared.from,
      loaded: isRuntimeSharedLoaded(shared),
      loading: isRuntimeSharedLoading(shared),
      singleton: shared.shareConfig?.singleton === true,
      eager: shared.shareConfig?.eager === true,
      strategy: shared.strategy,
      compatible,
      rejectionReason: compatible === false ? "version-mismatch" : void 0
    };
  }
  function getRuntimeSharedCandidates(args) {
    return Object.entries(args.shareScopeMap?.[args.scope]?.[args.pkgName] || {}).filter((entry) => entry[1] !== void 0).map(([version, shared]) => createRuntimeSharedCandidate(args.scope, version, shared, args.requiredVersion));
  }
  function createRuntimeSharedSelection(args, selectedShared, selectionError) {
    const requiredVersion = args.shareInfo.shareConfig?.requiredVersion;
    const candidates = getRuntimeSharedCandidates({
      shareScopeMap: args.shareScopeMap,
      scope: args.scope,
      pkgName: args.pkgName,
      requiredVersion
    });
    const selectedVersion = selectedShared?.version;
    const selected = selectedShared && selectedVersion ? createRuntimeSharedCandidate(args.scope, selectedVersion, selectedShared, requiredVersion) : void 0;
    let reason;
    let failureReason;
    if (selectionError) {
      reason = args.shareInfo.shareConfig?.singleton === true && args.shareInfo.shareConfig?.strictVersion === true && typeof requiredVersion === "string" && getRuntimeSharedCompatibility(args.version, requiredVersion) === false ? "strict-version-rejected" : "load-error";
      failureReason = reason;
    } else if (!selected) {
      reason = candidates.length ? "version-mismatch" : "missing-provider";
      failureReason = reason;
    } else if (args.shareInfo.shareConfig?.singleton) reason = "singleton-existing";
    else if (args.shareInfo.strategy === "loaded-first" && (selected.loaded || selected.loading)) reason = "loaded-first";
    else if (selected.version === args.shareInfo.version) reason = "exact-match";
    else if (requiredVersion === false || requiredVersion === "*") reason = args.shareInfo.strategy === "loaded-first" ? "loaded-first" : "version-first";
    else if (selected.version === args.version) reason = "compatible-highest-version";
    else reason = "compatible-version";
    const candidatesWithReasons = candidates.map((candidate) => {
      if (selected && candidate.scope === selected.scope && candidate.version === selected.version && candidate.provider === selected.provider) return {
        ...candidate,
        rejectionReason: void 0
      };
      if (candidate.rejectionReason) return candidate;
      if (!selected) return candidate;
      if (reason === "custom-resolver") return {
        ...candidate,
        rejectionReason: "custom-resolver"
      };
      if (reason === "singleton-existing") return {
        ...candidate,
        rejectionReason: "singleton-existing"
      };
      if (reason === "loaded-first" && !candidate.loaded && !candidate.loading) return {
        ...candidate,
        rejectionReason: "not-loaded"
      };
      return {
        ...candidate,
        rejectionReason: "lower-priority-version"
      };
    });
    return {
      scope: args.scope,
      requestedVersion: args.shareInfo.version,
      requiredVersion,
      singleton: args.shareInfo.shareConfig?.singleton,
      strictVersion: args.shareInfo.shareConfig?.strictVersion,
      eager: args.shareInfo.shareConfig?.eager,
      strategy: args.shareInfo.strategy,
      candidates: candidatesWithReasons,
      selected,
      reason,
      failureReason,
      context: args.loadContext
    };
  }
  function createSharedCandidate(candidate) {
    return {
      scope: candidate.scope,
      version: candidate.version,
      provider: candidate.provider,
      loaded: candidate.loaded === true,
      loading: candidate.loading === true,
      singleton: candidate.singleton === true,
      eager: candidate.eager === true,
      strategy: candidate.strategy,
      compatible: candidate.compatible,
      rejectionReason: candidate.rejectionReason
    };
  }
  function createSharedInfo(args, reason, selection) {
    const shareConfig = args.shareInfo?.shareConfig;
    const selected = selection?.selected;
    const context = selection?.context || args.loadContext;
    const handledBundlerRuntimeShared = reason === "custom-share-info-unmatched";
    const loaded = selected?.loaded ?? args.selectedShared?.loaded;
    const candidates = selection?.candidates?.map(createSharedCandidate);
    return {
      name: args.pkgName,
      shareScope: selection?.scope ? [selection.scope] : getSharedScopes(args.shareInfo),
      version: selection?.requestedVersion || args.selectedShared?.version || args.shareInfo?.version,
      requiredVersion: selection?.requiredVersion ?? shareConfig?.requiredVersion,
      selectedVersion: selected?.version || args.selectedShared?.version,
      availableVersions: candidates?.length ? Array.from(new Set(candidates.map((candidate) => candidate.version))) : getAvailableSharedVersions(args),
      provider: selected?.provider || args.selectedShared?.from,
      useIn: getSharedUseIn(args),
      singleton: selection?.singleton ?? shareConfig?.singleton,
      strictVersion: selection?.strictVersion ?? shareConfig?.strictVersion,
      eager: selection?.eager ?? shareConfig?.eager,
      strategy: selection?.strategy || args.shareInfo?.strategy,
      loaded,
      loading: loaded ? void 0 : selected?.loading || Boolean(args.selectedShared?.loading) || void 0,
      reason,
      selectionReason: selection?.reason,
      failureReason: selection?.failureReason,
      candidates,
      loadType: selection?.loadType,
      trigger: context?.trigger,
      moduleId: context?.moduleId,
      chunkId: context?.chunkId,
      remote: context?.remote,
      expose: context?.expose,
      requestId: context?.requestId,
      operationId: context?.operationId,
      fallback: selection?.fallback,
      recovered: selection?.recovered ?? args.recovered,
      definedBy: handledBundlerRuntimeShared ? "bundler-runtime" : void 0
    };
  }
  function createSharedRegistrationInfo(args, registrationId) {
    const candidateSource = args.shared;
    const effectiveSource = args.registeredShared;
    const requiredVersion = candidateSource.shareConfig?.requiredVersion;
    const candidate = createSharedCandidate(createRuntimeSharedCandidate(args.scope, candidateSource.version || "0", candidateSource, requiredVersion));
    const effective = effectiveSource ? createSharedCandidate(createRuntimeSharedCandidate(args.scope, effectiveSource.version || "0", effectiveSource, requiredVersion)) : void 0;
    const candidates = getRuntimeSharedCandidates({
      shareScopeMap: args.shareScopeMap,
      scope: args.scope,
      pkgName: args.pkgName,
      requiredVersion
    });
    const previous = args.previousShared;
    let action;
    let reason;
    if (previous === candidateSource) {
      action = "reused";
      reason = "same-registration-reused";
    } else if (!previous && effectiveSource) {
      action = "registered";
      reason = "first-registration";
    } else if (previous && effectiveSource !== previous) {
      action = "replaced";
      reason = candidate.eager && previous.shareConfig?.eager !== true ? "eager-preferred" : "provider-name-preferred";
    } else {
      action = "ignored";
      reason = previous?.strategy === "loaded-first" ? "loaded-first-preserved" : previous?.loaded ? "loaded-version-preserved" : previous?.shareConfig?.eager && !candidate.eager ? "eager-provider-preserved" : "provider-name-preserved";
    }
    return {
      name: args.pkgName,
      shareScope: [args.scope],
      version: candidate.version,
      selectedVersion: effective?.version,
      availableVersions: Array.from(new Set(candidates.map((item) => item.version))),
      provider: effective?.provider,
      singleton: candidate.singleton,
      eager: candidate.eager,
      strategy: candidate.strategy,
      loaded: effective?.loaded,
      loading: effective?.loading || void 0,
      candidates: candidates.map(createSharedCandidate),
      trigger: args.trigger,
      registration: {
        registrationId,
        action,
        reason,
        trigger: args.trigger,
        scope: args.scope,
        candidate,
        effective
      }
    };
  }
  function sanitizeSharedCandidate(candidate) {
    const scope = sanitizeText(candidate.scope, 120);
    const version = sanitizeText(candidate.version, 120);
    if (!scope || !version) return;
    return {
      scope,
      version,
      provider: sanitizeText(candidate.provider, 160),
      loaded: candidate.loaded === true,
      loading: candidate.loading === true,
      singleton: candidate.singleton === true,
      eager: candidate.eager === true,
      strategy: sanitizeText(candidate.strategy, 80),
      compatible: candidate.compatible,
      rejectionReason: sanitizeText(candidate.rejectionReason, 120)
    };
  }
  function sanitizeSharedRegistration(registration) {
    if (!registration) return;
    const candidate = sanitizeSharedCandidate(registration.candidate);
    const effective = registration.effective ? sanitizeSharedCandidate(registration.effective) : void 0;
    const registrationId = sanitizeText(registration.registrationId, 120);
    const scope = sanitizeText(registration.scope, 120);
    const trigger = sanitizeText(registration.trigger, 80);
    const reason = sanitizeText(registration.reason, 120);
    if (!candidate || !registrationId || !scope || !trigger || !reason) return;
    return {
      registrationId,
      action: registration.action,
      reason,
      trigger,
      scope,
      candidate,
      effective
    };
  }
  function sanitizeShared(shared) {
    if (!shared || !shared.name) return;
    return {
      name: sanitizeText(shared.name, 160) || "unknown",
      shareScope: normalizeSharedScope(shared.shareScope),
      version: sanitizeText(shared.version, 120),
      requiredVersion: shared.requiredVersion === false ? false : sanitizeText(shared.requiredVersion, 120),
      selectedVersion: sanitizeText(shared.selectedVersion, 120),
      availableVersions: (shared.availableVersions || []).map((version) => sanitizeText(version, 120)).filter((version) => Boolean(version)).slice(0, 20),
      provider: sanitizeText(shared.provider, 160),
      useIn: (shared.useIn || []).map((consumer) => sanitizeText(consumer, 160)).filter((consumer) => Boolean(consumer)),
      singleton: shared.singleton,
      strictVersion: shared.strictVersion,
      eager: shared.eager,
      strategy: sanitizeText(shared.strategy, 80),
      loaded: shared.loaded,
      loading: shared.loading,
      reason: sanitizeText(shared.reason, 120),
      definedBy: shared.definedBy === "bundler-runtime" ? "bundler-runtime" : void 0,
      conflict: sanitizeSharedConflict(shared.conflict),
      candidates: (shared.candidates || []).map(sanitizeSharedCandidate).filter((candidate) => candidate !== void 0).slice(0, 20),
      selectionReason: sanitizeText(shared.selectionReason, 120),
      failureReason: sanitizeText(shared.failureReason, 120),
      loadType: shared.loadType === "sync" || shared.loadType === "async" ? shared.loadType : void 0,
      trigger: sanitizeText(shared.trigger, 80),
      moduleId: typeof shared.moduleId === "number" ? shared.moduleId : sanitizeText(shared.moduleId, 160),
      chunkId: typeof shared.chunkId === "number" ? shared.chunkId : sanitizeText(shared.chunkId, 160),
      remote: sanitizeText(shared.remote, 160),
      expose: sanitizeText(shared.expose, 240),
      requestId: sanitizeText(shared.requestId, 240),
      operationId: sanitizeText(shared.operationId, 160),
      fallback: shared.fallback === true || void 0,
      recovered: shared.recovered === true || void 0,
      registration: sanitizeSharedRegistration(shared.registration)
    };
  }
  function sanitizeSharedConflict(conflict) {
    if (!conflict) return;
    const scope = sanitizeText(conflict.scope, 120) || "default";
    const versions = (conflict.versions || []).map((version) => sanitizeText(version, 120)).filter((version) => Boolean(version)).slice(0, 20);
    const existingVersions = (conflict.existingVersions || []).map((item) => ({
      version: sanitizeText(item.version, 120),
      from: sanitizeText(item.from, 160),
      singleton: item.singleton === true || void 0,
      loaded: item.loaded === true || void 0
    })).filter((item) => typeof item.version === "string" && item.version.length > 0).slice(0, 20);
    return {
      reason: SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON,
      scope,
      currentVersion: sanitizeText(conflict.currentVersion, 120),
      currentFrom: sanitizeText(conflict.currentFrom, 160),
      versions,
      existingVersions
    };
  }
  function copyEvent(event) {
    return omitUndefinedFields({
      ...event,
      remote: event.remote ? { ...event.remote } : void 0,
      resource: event.resource ? { ...event.resource } : void 0,
      shared: event.shared ? {
        ...event.shared,
        shareScope: event.shared.shareScope ? [...event.shared.shareScope] : void 0,
        availableVersions: event.shared.availableVersions ? [...event.shared.availableVersions] : void 0,
        conflict: copySharedConflict(event.shared.conflict)
      } : void 0,
      errorContext: event.errorContext ? { ...event.errorContext } : void 0,
      metadata: event.metadata ? { ...event.metadata } : void 0,
      loadedBefore: copyLoadedBeforeInfo(event.loadedBefore),
      bridge: copyBridgeInfo(event.bridge)
    });
  }
  function copyBridgeInfo(bridge) {
    if (!bridge) return;
    return omitUndefinedFields({
      ...bridge,
      route: bridge.route ? { ...bridge.route } : void 0,
      error: bridge.error ? { ...bridge.error } : void 0
    });
  }
  function copySharedConflict(conflict) {
    if (!conflict) return;
    return {
      ...conflict,
      versions: [...conflict.versions],
      existingVersions: conflict.existingVersions.map((item) => ({ ...item }))
    };
  }
  function copySummary(summary) {
    return {
      ...summary,
      phases: Object.entries(summary.phases).reduce((memo, [phase, phaseSummary]) => {
        memo[phase] = { ...phaseSummary };
        return memo;
      }, {}),
      shared: summary.shared ? {
        ...summary.shared,
        shareScope: summary.shared.shareScope ? [...summary.shared.shareScope] : void 0
      } : void 0,
      flags: { ...summary.flags },
      error: summary.error ? {
        ...summary.error,
        context: summary.error.context ? { ...summary.error.context } : void 0
      } : void 0
    };
  }
  function copyFactReport(diagnosis) {
    if (!diagnosis) return;
    return {
      ...diagnosis,
      facts: { ...diagnosis.facts },
      completedPhases: [...diagnosis.completedPhases],
      pendingPhases: [...diagnosis.pendingPhases],
      warnings: diagnosis.warnings ? [...diagnosis.warnings] : void 0,
      actions: diagnosis.actions.map((action) => ({ ...action }))
    };
  }
  function copyModuleInfoSummary(moduleInfo) {
    if (!moduleInfo) return;
    return {
      ...moduleInfo,
      entries: moduleInfo.entries.map((entry) => ({ ...entry })),
      availableNames: moduleInfo.availableNames ? [...moduleInfo.availableNames] : void 0
    };
  }
  function copyLoadedBeforeInfo(loadedBefore) {
    if (!loadedBefore) return;
    return {
      producer: loadedBefore.producer,
      expose: loadedBefore.expose,
      consumers: loadedBefore.consumers.map((consumer) => ({
        ...consumer,
        exposes: consumer.exposes ? [...consumer.exposes] : void 0
      }))
    };
  }
  function copyReport(report) {
    return omitUndefinedFields({
      ...report,
      remote: report.remote ? { ...report.remote } : void 0,
      shared: report.shared ? {
        ...report.shared,
        shareScope: report.shared.shareScope ? [...report.shared.shareScope] : void 0,
        availableVersions: report.shared.availableVersions ? [...report.shared.availableVersions] : void 0,
        conflict: copySharedConflict(report.shared.conflict)
      } : void 0,
      errorContext: report.errorContext ? { ...report.errorContext } : void 0,
      moduleInfo: copyModuleInfoSummary(report.moduleInfo),
      loadedBefore: copyLoadedBeforeInfo(report.loadedBefore),
      bridge: copyBridgeInfo(report.bridge),
      events: report.events.map(copyEvent),
      summary: copySummary(report.summary),
      diagnosis: copyFactReport(report.diagnosis)
    });
  }
  function getFederationGlobal() {
    return globalThis.__FEDERATION__;
  }
  function normalizeExposeName(value) {
    const sanitized = sanitizeText(value, 240);
    if (!sanitized) return;
    return sanitized.replace(/^\.\//, "");
  }
  function getModuleCacheEntries(moduleCache) {
    if (!moduleCache) return [];
    if (moduleCache instanceof Map) return Array.from(moduleCache.values());
    const entries = typeof moduleCache.entries === "function" ? Array.from(moduleCache.entries.call(moduleCache)) : void 0;
    if (entries) return entries.map(([, value]) => value);
    if (isRecord(moduleCache)) return Object.values(moduleCache);
    return [];
  }
  function getLoadedExposesForRemote(instance, remoteName) {
    if (!remoteName) return [];
    return Array.from(new Set(Object.values(instance.remoteHandler?.idToRemoteMap || {}).filter((item) => item?.name === remoteName).map((item) => sanitizeText(item.expose, 240)).filter((expose) => Boolean(expose))));
  }
  function collectLoadedBeforeInfo(remote, expose, origin) {
    const entryGlobalName = remote?.entryGlobalName;
    if (!entryGlobalName) return;
    const federation = getFederationGlobal();
    const instances = Array.isArray(federation?.__INSTANCES__) ? federation.__INSTANCES__ : [];
    const targetExpose = normalizeExposeName(expose);
    const consumers = [];
    instances.forEach((instance) => {
      if (instance === origin) return;
      const matchedModule = getModuleCacheEntries(instance.moduleCache).find((item) => isRuntimeModuleWithEntryGlobalName(item, entryGlobalName));
      if (!matchedModule) return;
      const exposes = getLoadedExposesForRemote(instance, matchedModule.remoteInfo?.name);
      const consumer = {
        name: sanitizeText(instance.options?.name, 120) || sanitizeText(instance.name, 120),
        remoteEntryExports: Boolean(matchedModule.remoteEntryExports),
        containerInitialized: matchedModule.inited === true,
        exposes: exposes.length ? exposes : void 0
      };
      consumers.push(omitUndefinedFields(consumer));
    });
    if (!consumers.length) return;
    return {
      producer: true,
      expose: targetExpose ? consumers.some((consumer) => (consumer.exposes || []).some((loadedExpose) => normalizeExposeName(loadedExpose) === targetExpose)) : false,
      consumers
    };
  }
  function isRuntimeModuleWithEntryGlobalName(value, entryGlobalName) {
    if (!isRecord(value)) return false;
    const remoteInfo = getObjectValue(value, "remoteInfo");
    return isRecord(remoteInfo) && getObjectValue(remoteInfo, "entryGlobalName") === entryGlobalName;
  }
  var traceCounter = 0;
  function normalizeScope(value) {
    return sanitizeText(value, 120)?.replace(/[^\w:@.-]+/g, "-") || "default";
  }
  function shouldRecordEvent(level, event) {
    if (level === "verbose") return true;
    if (level === "summary") return event.status !== "start";
    return event.status === "error" || Boolean(event.error);
  }
  function createTraceId(event) {
    traceCounter += 1;
    return `mf-${(event.remote?.name || event.phase || "runtime").replace(/[^a-z0-9]+/gi, "-").slice(0, 80)}-${Date.now().toString(36)}-${traceCounter.toString(36)}`;
  }
  function getPhaseDurationKey(event) {
    const exposeKey = event.phase === "expose" || event.phase === "moduleFactory" ? event.expose || "" : "";
    return [
      event.traceId,
      event.phase,
      event.requestId || event.remote?.name || event.shared?.name || "",
      exposeKey
    ].join("|");
  }
  function getRemoteEntryKey(remote) {
    if (!remote?.name) return;
    return [
      remote.name,
      remote.entryGlobalName || "",
      remote.entry || ""
    ].join("|");
  }
  function getHostRemotesSummary(options) {
    const remotes = (options?.remotes || []).map((remote) => clipText(remote.alias || remote.name || remote.entry, 120)).filter((remote) => Boolean(remote)).slice(0, 20);
    return remotes.length ? remotes.join(",") : void 0;
  }
  function resolveRemoteFromRequestId(id, options) {
    if (!id) return;
    const matchedRemote = (options?.remotes || []).filter((remote) => {
      return [remote.alias, remote.name].filter((key) => Boolean(key)).some((key) => id === key || id.startsWith(`${key}/`));
    }).sort((left, right) => {
      const leftKey = left.alias || left.name || "";
      return (right.alias || right.name || "").length - leftKey.length;
    })[0];
    return createRemoteInfo(matchedRemote);
  }
  function resolveAliasRequestId(requestId, remote) {
    if (!requestId || !remote?.alias || remote.alias === remote.name) return;
    if (requestId === remote.name) return remote.alias;
    if (requestId.startsWith(`${remote.name}/`)) return `${remote.alias}/${requestId.slice(remote.name.length + 1)}`;
  }
  function sanitizeModuleInfoPath(value) {
    if (typeof value !== "string") return;
    return clipText(value, 320);
  }
  function sanitizeModuleInfoGetPublicPath(value) {
    if (typeof value !== "string") return;
    return clipText(value, 500);
  }
  function sanitizeModuleInfoRemoteEntry(value) {
    if (typeof value !== "string") return;
    return clipText(value, 320);
  }
  function createClippedModuleInfoEntry(rawName, rawValue) {
    const name = clipText(rawName, 240);
    if (!name) return;
    const value = isRecord(rawValue) ? rawValue : {};
    return {
      name,
      publicPath: sanitizeModuleInfoPath(value["publicPath"]),
      getPublicPath: sanitizeModuleInfoGetPublicPath(value["getPublicPath"]),
      remoteEntry: sanitizeModuleInfoRemoteEntry(value["remoteEntry"]),
      globalName: sanitizeText(value["globalName"], 160)
    };
  }
  function normalizeModuleInfoLookupValue(value) {
    if (typeof value !== "string" || !value) return;
    return (/^https?:\/\//i.test(value) || value.startsWith("/") ? sanitizeUrl(value) : sanitizeText(value, 240))?.toLowerCase();
  }
  function getModuleInfoLookupValues(report) {
    return new Set([
      report.requestId?.split("/")[0],
      report.remote?.name,
      report.remote?.alias,
      report.remote?.entry,
      report.remote?.entryGlobalName,
      report.sanitizedUrl,
      report.errorContext?.["remoteName"],
      report.errorContext?.["remoteAlias"],
      report.errorContext?.["url"],
      report.summary.error?.context?.["remoteName"],
      report.summary.error?.context?.["remoteAlias"],
      report.summary.error?.context?.["url"]
    ].map(normalizeModuleInfoLookupValue).filter((value) => Boolean(value)));
  }
  function matchesModuleInfoLookup(entry, lookupValues) {
    if (!lookupValues.size) return false;
    return [
      entry.name,
      entry.publicPath,
      entry.getPublicPath,
      entry.remoteEntry,
      entry.globalName
    ].map(normalizeModuleInfoLookupValue).filter((value) => Boolean(value)).some((entryValue) => Array.from(lookupValues).some((lookupValue) => entryValue === lookupValue || entryValue.startsWith(`${lookupValue}:`) || entryValue.includes(`:${lookupValue}`) || lookupValue.startsWith("http") && entryValue.includes(lookupValue)));
  }
  function getModuleInfoCaptureReason(report) {
    const text = [
      report.errorCode,
      report.errorName,
      report.errorMessage,
      report.summary.error?.errorCode,
      report.summary.error?.errorName,
      report.summary.error?.errorMessage,
      ...report.events.flatMap((event) => [
        event.errorCode,
        event.errorName,
        event.errorMessage,
        event.message,
        event.lifecycle
      ])
    ].join("\n");
    if (/RUNTIME-007/.test(text)) return "remote-snapshot";
    if (/RUNTIME-011/.test(text)) return "remote-entry-missing-in-snapshot";
    if (/moduleInfo|module info/i.test(text)) return "module-info";
    if (/remote snapshot|global snapshot|snapshot/i.test(text)) return "remote-snapshot";
  }
  function createModuleInfoSummary(report) {
    const reason = getModuleInfoCaptureReason(report);
    if (!reason) return;
    const moduleInfo = getFederationGlobal()?.moduleInfo;
    const rawEntries = isRecord(moduleInfo) ? Object.entries(moduleInfo) : [];
    const clippedEntries = rawEntries.map(([name, value]) => createClippedModuleInfoEntry(name, value)).filter((entry) => Boolean(entry));
    const lookupValues = getModuleInfoLookupValues(report);
    const matchedEntries = clippedEntries.filter((entry) => matchesModuleInfoLookup(entry, lookupValues));
    return {
      reason,
      clipped: true,
      totalCount: rawEntries.length,
      matchedCount: matchedEntries.length,
      entries: matchedEntries.slice(0, MAX_MODULE_INFO_ENTRIES),
      availableNames: matchedEntries.length ? void 0 : clippedEntries.map((entry) => entry.name).slice(0, MAX_MODULE_INFO_ENTRIES)
    };
  }
  function getResourceErrorType(event) {
    if (event.resource?.errorType) return event.resource.errorType;
    const text = `${event.errorMessage || ""}
${event.message || ""}`;
    if (!event.errorCode && !text) return;
    if (/ScriptExecutionError/i.test(text)) return "script-execution";
    if (/timeout|timed out/i.test(text)) return "timeout";
    if (/ScriptNetworkError|NetworkError|Failed to fetch|Request failed|ERR_|404|CORS/i.test(text)) return "network";
    return event.errorCode === "RUNTIME-008" ? "unknown" : void 0;
  }
  function getOwnerHint(event) {
    const resourceErrorType = getResourceErrorType(event);
    if (event.resource?.errorType) {
      if (resourceErrorType === "network" || resourceErrorType === "timeout" || resourceErrorType === "http") return "network";
      if (resourceErrorType === "execution" || resourceErrorType === "content") return "remote";
    }
    switch (event.errorCode) {
      case "RUNTIME-001":
      case "RUNTIME-002":
      case "RUNTIME-011":
      case "RUNTIME-013":
      case "RUNTIME-014":
      case "RUNTIME-015":
        return "remote";
      case "RUNTIME-003":
      case "RUNTIME-004":
      case "RUNTIME-007":
        return "host";
      case "RUNTIME-005":
      case "RUNTIME-006":
      case "RUNTIME-012":
        return "shared";
      case "RUNTIME-008":
        return resourceErrorType === "network" || resourceErrorType === "timeout" ? "network" : "remote";
      default:
        if (event.shared) return "shared";
        if (event.remote) return "remote";
        if (event.phase === "manifest" || event.phase === "matchRemote") return "host";
        return event.errorCode ? "runtime" : void 0;
    }
  }
  function getRetryable(event) {
    const resourceErrorType = getResourceErrorType(event);
    if (resourceErrorType === "network" || resourceErrorType === "timeout") return true;
    if (resourceErrorType === "execution" || resourceErrorType === "content") return false;
    if (event.errorCode === "RUNTIME-008") return resourceErrorType === "network" || resourceErrorType === "timeout";
    if (event.errorCode === "RUNTIME-003") {
      const text = `${event.errorMessage || ""}
${event.message || ""}`;
      return /NetworkError|Failed to fetch|Request failed|timeout|timed out/i.test(text);
    }
    if (event.errorCode && [
      "RUNTIME-001",
      "RUNTIME-002",
      "RUNTIME-004",
      "RUNTIME-005",
      "RUNTIME-006",
      "RUNTIME-011",
      "RUNTIME-012",
      "RUNTIME-013",
      "RUNTIME-014",
      "RUNTIME-015"
    ].includes(event.errorCode)) return false;
  }
  function createErrorContext(event, inputContext) {
    const context = { ...inputContext };
    if (event.lifecycle) context["lifecycle"] = event.lifecycle;
    if (event.requestId) context["requestId"] = event.requestId;
    if (event.requestAlias) context["requestAlias"] = event.requestAlias;
    if (event.remote?.name) context["remoteName"] = event.remote.name;
    if (event.remote?.alias) context["remoteAlias"] = event.remote.alias;
    if (event.remote?.type) context["remoteType"] = event.remote.type;
    if (event.remote?.entryGlobalName) context["entryGlobalName"] = event.remote.entryGlobalName;
    if (event.sanitizedUrl) context["url"] = event.sanitizedUrl;
    if (event.expose) context["expose"] = event.expose;
    if (event.shared?.name) context["shareName"] = event.shared.name;
    if (event.shared?.requiredVersion) context["requiredVersion"] = event.shared.requiredVersion;
    if (event.shared?.selectedVersion) context["selectedVersion"] = event.shared.selectedVersion;
    if (event.shared?.provider) context["provider"] = event.shared.provider;
    const resourceErrorType = getResourceErrorType(event);
    if (resourceErrorType) context["resourceErrorType"] = resourceErrorType === "execution" ? "script-execution" : resourceErrorType;
    return clipObservabilityMetadata(context);
  }
  function createReportManager({ options, configuredMaxEvents, getInstanceRef, getAppliedRuntimeVersion }) {
    const events = [];
    const reports = /* @__PURE__ */ new Map();
    const latestTraceByInstance = /* @__PURE__ */ new Map();
    const traceByRequest = /* @__PURE__ */ new Map();
    const traceByRemote = /* @__PURE__ */ new Map();
    const traceByBridgeOperation = /* @__PURE__ */ new Map();
    const traceByBridgeId = /* @__PURE__ */ new Map();
    const phaseStartTimes = /* @__PURE__ */ new Map();
    let latestTraceId;
    let effectiveMaxEvents = configuredMaxEvents;
    const getTraceMapKey = (instanceRef, value) => `${instanceRef || "legacy"}\0${value}`;
    const resolveTraceId = (event) => {
      const sanitizedRequestId = sanitizeRequestId(event.requestId);
      const instanceRef = sanitizeText(event.instanceRef, 80);
      if (event.traceId && reports.has(event.traceId)) return event.traceId;
      if (event.status === "start" && event.phase === "loadRemote") {
        const traceId = event.traceId || createTraceId(event);
        if (sanitizedRequestId) traceByRequest.set(getTraceMapKey(instanceRef, sanitizedRequestId), traceId);
        if (event.remote?.name) traceByRemote.set(getTraceMapKey(instanceRef, event.remote.name), traceId);
        return traceId;
      }
      if (sanitizedRequestId) {
        const traceId = traceByRequest.get(getTraceMapKey(instanceRef, sanitizedRequestId));
        if (traceId) return traceId;
      }
      if (event.bridge?.operationId) {
        const traceId = traceByBridgeOperation.get(getTraceMapKey(instanceRef, event.bridge.operationId));
        if (traceId) return traceId;
      }
      if (event.bridge?.bridgeId) {
        const traceId = traceByBridgeId.get(getTraceMapKey(instanceRef, event.bridge.bridgeId));
        if (traceId) return traceId;
      }
      if (event.bridge?.operationId && (event.status === "start" || event.phase === "bridge-provider")) return event.traceId || createTraceId(event);
      if (event.remote?.name) {
        const traceId = traceByRemote.get(getTraceMapKey(instanceRef, event.remote.name));
        if (traceId) return traceId;
      }
      return event.traceId || createTraceId(event);
    };
    const normalizeEvent2 = (event, traceId, origin) => {
      const errorInfo = getErrorInfo(event.error, options.stackTrace);
      const sanitizedRemote = sanitizeRemote(event.remote);
      const sanitizedResource = sanitizeResource(event.resource);
      const sanitizedShared = sanitizeShared(event.shared);
      const requestAlias = sanitizeRequestId(event.requestAlias) || resolveAliasRequestId(event.requestId, sanitizedRemote);
      const hostName = sanitizeText(event.hostName, 120) || sanitizeText(origin?.options?.name, 120);
      const runtimeVersion = sanitizeText(origin?.version, 80) || getAppliedRuntimeVersion();
      const message = sanitizedResource ? sanitizeText(event.message) || sanitizeText(errorInfo.errorMessage) : getRawText(event.message) || errorInfo.errorMessage;
      const normalizedErrorMessage = sanitizedResource ? sanitizeText(errorInfo.errorMessage) : errorInfo.errorMessage;
      const normalizedErrorStack = sanitizedResource ? sanitizeText(errorInfo.errorStack, 4e3) : errorInfo.errorStack;
      const normalizedEvent = {
        traceId,
        instanceRef: event.instanceRef || getInstanceRef(origin),
        timestamp: event.timestamp || Date.now(),
        phase: sanitizeText(event.phase, 120) || "runtime",
        status: event.status,
        requestId: sanitizeRequestId(event.requestId),
        requestAlias,
        hostName,
        runtimeVersion,
        remote: sanitizedRemote,
        resource: sanitizedResource,
        shared: sanitizedShared,
        expose: sanitizeText(event.expose, 240),
        sanitizedUrl: sanitizedResource?.url || clipText(event.url || event.remote?.entry, 320),
        message,
        errorCode: errorInfo.errorCode,
        errorName: errorInfo.errorName,
        errorMessage: normalizedErrorMessage,
        errorStack: normalizedErrorStack,
        duration: typeof event.duration === "number" && Number.isFinite(event.duration) ? Math.max(0, event.duration) : void 0,
        lifecycle: sanitizeText(event.lifecycle, 120),
        eventName: sanitizeText(event.eventName, 160),
        source: normalizeEventSource(event.source),
        recovered: event.recovered === true || void 0,
        cached: event.cached === true || void 0,
        componentName: sanitizeText(event.componentName, 160),
        metadata: clipObservabilityMetadata(event.metadata),
        loadedBefore: copyLoadedBeforeInfo(event.loadedBefore),
        bridge: copyBridgeInfo(event.bridge)
      };
      if (normalizedEvent.status === "error" || event.error) {
        normalizedEvent.ownerHint = getOwnerHint(normalizedEvent);
        normalizedEvent.retryable = getRetryable(normalizedEvent);
        normalizedEvent.errorContext = createErrorContext(normalizedEvent, event.errorContext);
      }
      return normalizedEvent;
    };
    const applyPhaseDuration = (event) => {
      const key = getPhaseDurationKey(event);
      if (event.status === "start") {
        phaseStartTimes.set(key, event.timestamp);
        return;
      }
      if (event.duration !== void 0) return;
      const startedAt = phaseStartTimes.get(key);
      if (startedAt === void 0) return;
      event.duration = Math.max(0, event.timestamp - startedAt);
      phaseStartTimes.delete(key);
    };
    const updateTraceMaps = (event) => {
      if (event.requestId) traceByRequest.set(getTraceMapKey(event.instanceRef, event.requestId), event.traceId);
      if (event.remote?.name) traceByRemote.set(getTraceMapKey(event.instanceRef, event.remote.name), event.traceId);
      if (event.bridge?.operationId) traceByBridgeOperation.set(getTraceMapKey(event.instanceRef, event.bridge.operationId), event.traceId);
      if (event.bridge?.bridgeId) traceByBridgeId.set(getTraceMapKey(event.instanceRef, event.bridge.bridgeId), event.traceId);
    };
    const trimEvents = (report) => {
      while (events.length > effectiveMaxEvents) events.shift();
      while (report.events.length > effectiveMaxEvents) report.events.shift();
    };
    const getEventOutcome = (event) => {
      if (event.status === "success") return "success";
      if (event.status === "error") return "error";
      if (event.status === "complete") {
        if (event.recovered) return "recovered";
        if (event.errorName || event.errorMessage) return "error";
      }
    };
    const isLoadRemoteCompleteEvent = (event) => event.phase === "loadRemote" && event.status === "complete";
    const isRuntimeLoadedEvent = (event) => event.phase === "loadRemote" && (event.status === "success" || event.status === "complete" && event.recovered);
    const isSharedResolvedEvent = (event) => event.phase === "shared" && (event.status === "success" || event.status === "complete" && event.recovered);
    const isSharedRegisteredEvent = (event) => event.phase === "shared-registration" && event.status === "success";
    const isPreloadedEvent = (event) => event.phase === "preload" && event.status === "success";
    const isComponentLoadedEvent = (event) => event.status === "success" && (event.eventName === COMPONENT_BUSINESS_LOADED_EVENT || event.phase === "component" && event.message === COMPONENT_BUSINESS_LOADED_EVENT);
    const shouldReplaceFailedPhase = (report, event) => {
      if (isLoadRemoteCompleteEvent(event) && report.failedPhase) return false;
      if (!report.failedPhase) return true;
      return report.failedPhase === "loadRemote" && event.phase !== "loadRemote";
    };
    const createEmptyPhaseCollection = () => ({
      phases: {},
      flags: {
        cached: false,
        fallback: false,
        recovered: false
      }
    });
    const createPhaseCollection = (eventsForReport) => {
      const collection = createEmptyPhaseCollection();
      eventsForReport.forEach((event) => {
        const phase = event.phase;
        const phaseSummary = collection.phases[phase] || { status: event.status };
        if (event.status !== "start") phaseSummary.status = event.status;
        if (event.duration !== void 0) phaseSummary.duration = event.duration;
        if (event.cached) {
          phaseSummary.cached = true;
          collection.flags.cached = true;
        }
        if (event.recovered) {
          phaseSummary.recovered = true;
          collection.flags.recovered = true;
        }
        if (event.lifecycle) phaseSummary.lifecycle = event.lifecycle;
        collection.phases[phase] = phaseSummary;
        if (event.phase === "loadRemote" && event.status === "complete" && event.recovered) collection.flags.fallback = true;
        if (event.shared?.fallback) collection.flags.fallback = true;
        if (event.shared?.selectedVersion || event.shared?.provider) collection.shared = {
          name: event.shared.name,
          provider: event.shared.provider,
          selectedVersion: event.shared.selectedVersion,
          shareScope: event.shared.shareScope ? [...event.shared.shareScope] : void 0
        };
      });
      return collection;
    };
    const createErrorSummary = (eventsForReport, failedPhase) => {
      const errorEvent = eventsForReport.find((event) => event.status === "error" && event.phase === failedPhase) || eventsForReport.find((event) => event.status === "error") || eventsForReport.find((event) => event.status === "complete" && event.errorMessage);
      if (!errorEvent) return;
      return {
        errorCode: errorEvent.errorCode,
        errorName: errorEvent.errorName,
        errorMessage: errorEvent.errorMessage,
        failedPhase: failedPhase || errorEvent.phase,
        lifecycle: errorEvent.lifecycle,
        ownerHint: errorEvent.ownerHint,
        retryable: errorEvent.retryable,
        context: errorEvent.errorContext ? { ...errorEvent.errorContext } : void 0
      };
    };
    const createReportSummary2 = (report) => {
      const loadCompleted = report.events.some(isLoadRemoteCompleteEvent);
      const runtimeLoaded = report.events.some(isRuntimeLoadedEvent);
      const sharedResolved = report.events.some(isSharedResolvedEvent);
      const sharedRegistered = report.events.some(isSharedRegisteredEvent);
      const preloaded = report.events.some(isPreloadedEvent);
      const recovered = report.events.some((item) => item.recovered);
      const componentLoaded = report.events.some(isComponentLoadedEvent);
      const lastEvent = report.events[report.events.length - 1];
      let outcome = "pending";
      if (recovered) outcome = "recovered";
      else if (componentLoaded) outcome = "component-loaded";
      else if (report.status === "error") outcome = "failed";
      else if (runtimeLoaded) outcome = "runtime-loaded";
      else if (sharedResolved) outcome = "shared-resolved";
      else if (sharedRegistered) outcome = "shared-registered";
      else if (preloaded) outcome = "preloaded";
      const phaseCollection = createPhaseCollection(report.events);
      return {
        eventCount: report.events.length,
        recovered,
        loadCompleted,
        runtimeLoaded,
        sharedResolved,
        sharedRegistered,
        preloaded,
        componentLoaded,
        outcome,
        lastPhase: lastEvent?.phase,
        phases: phaseCollection.phases,
        shared: phaseCollection.shared,
        flags: phaseCollection.flags,
        error: createErrorSummary(report.events, report.failedPhase)
      };
    };
    const refreshModuleInfoSummary = (report) => {
      const moduleInfo = createModuleInfoSummary(report);
      if (moduleInfo) report.moduleInfo = moduleInfo;
    };
    const getReportContext = (report) => report.summary.error?.context || report.errorContext;
    const getContextText = (context, key) => {
      const value = context?.[key];
      return typeof value === "string" && value ? value : void 0;
    };
    const getDiagnosisOwnerHint = (report) => report.summary.error?.ownerHint || report.ownerHint || (report.shared ? "shared" : report.remote ? "remote" : "unknown");
    const getDiagnosisResourceErrorType = (report) => getContextText(getReportContext(report), "resourceErrorType") || getResourceErrorType({
      errorCode: report.errorCode,
      errorMessage: report.errorMessage,
      message: report.events.at(-1)?.message,
      lifecycle: report.summary.error?.lifecycle
    });
    const getDiagnosisDocLink = (report) => {
      const matched = [
        report.errorMessage,
        report.errorStack,
        ...report.events.flatMap((event) => [
          event.errorMessage,
          event.errorStack,
          event.message
        ])
      ].filter((item) => Boolean(item)).join("\n").match(DIAGNOSTIC_DOC_LINK_PATTERN)?.[0];
      const docLink = sanitizeText(matched, 240);
      if (docLink) return docLink;
      return report.errorCode?.startsWith("RUNTIME-") ? RUNTIME_DOC_LINK : void 0;
    };
    const getDiagnosisTitle = (report) => {
      if (report.status !== "error") {
        if (report.shared) {
          if (report.shared.reason === SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON) return "Singleton shared dependency version conflict detected";
          if (report.summary.sharedResolved) return "Shared dependency resolved successfully";
          return "Shared dependency loading is pending";
        }
        if (report.summary.componentLoaded) return "Business component loaded";
        if (report.summary.runtimeLoaded) return "Remote loaded successfully";
        if (report.summary.preloaded) return "Remote preloaded successfully";
        return "Remote loading is pending";
      }
      switch (report.errorCode) {
        case "RUNTIME-001":
          return "Remote entry global was not registered";
        case "RUNTIME-003":
          return "Manifest could not be loaded";
        case "RUNTIME-004":
          return "Remote was not found in host remotes";
        case "RUNTIME-007":
          return "Deployment moduleInfo did not match the requested remote";
        case "RUNTIME-013":
          return "Manifest is not a valid Module Federation manifest";
        case "RUNTIME-014":
          return "Requested expose was not found in the remote";
        case "RUNTIME-015":
          return "Remote container initialization failed";
        case "RUNTIME-005":
        case "RUNTIME-006":
          return "Shared dependency could not be resolved";
        case "RUNTIME-008": {
          const resourceErrorType = getDiagnosisResourceErrorType(report);
          if (resourceErrorType === "network") return "Remote entry failed because of a network error";
          if (resourceErrorType === "timeout") return "Remote entry request timed out";
          if (resourceErrorType === "script-execution") return "Remote entry loaded but failed during execution";
          return "Remote entry resource could not be loaded";
        }
        default:
          if (report.failedPhase === "shared" || report.shared) return "Shared dependency could not be resolved";
          return report.failedPhase ? `Module Federation failed at ${report.failedPhase}` : "Module Federation loading failed";
      }
    };
    const getCompletedPhases = (report) => Array.from(new Set(report.events.filter((event) => event.status === "success" || event.status === "complete").map((event) => event.phase)));
    const getPendingPhases = (report) => {
      const started = /* @__PURE__ */ new Set();
      const ended = /* @__PURE__ */ new Set();
      report.events.forEach((event) => {
        if (event.status === "start") {
          started.add(event.phase);
          return;
        }
        ended.add(event.phase);
      });
      return Array.from(started).filter((phase) => !ended.has(phase));
    };
    const createDiagnosisFacts = (report, ownerHint) => {
      const context = getReportContext(report);
      const facts = {};
      const addFact = (key, value) => {
        if (value === void 0 || value === null || value === "") return;
        facts[key] = Array.isArray(value) ? value.join(",") : value;
      };
      addFact("traceId", report.traceId);
      addFact("status", report.status);
      addFact("outcome", report.summary.outcome);
      addFact("errorCode", report.errorCode || report.summary.error?.errorCode);
      addFact("failedPhase", report.failedPhase || report.summary.error?.failedPhase);
      addFact("lifecycle", report.summary.error?.lifecycle);
      addFact("ownerHint", ownerHint);
      addFact("retryable", report.retryable ?? report.summary.error?.retryable);
      addFact("requestId", report.requestId);
      addFact("requestAlias", report.requestAlias || report.summary.error?.context?.["requestAlias"]);
      addFact("hostName", report.hostName);
      addFact("remoteName", report.remote?.name);
      addFact("remoteAlias", report.remote?.alias);
      addFact("remoteEntry", report.remote?.entry);
      addFact("entryGlobalName", report.remote?.entryGlobalName);
      addFact("remoteType", report.remote?.type);
      addFact("url", report.sanitizedUrl || getContextText(context, "url"));
      addFact("expose", report.expose);
      addFact("hostRemotes", getContextText(context, "hostRemotes"));
      addFact("resourceErrorType", getDiagnosisResourceErrorType(report));
      addFact("shareName", report.shared?.name);
      addFact("shareScope", report.shared?.shareScope);
      addFact("shareVersion", report.shared?.version);
      addFact("requiredVersion", report.shared?.requiredVersion);
      addFact("selectedVersion", report.shared?.selectedVersion);
      addFact("availableVersions", report.shared?.availableVersions);
      addFact("provider", report.shared?.provider);
      addFact("useIn", report.shared?.useIn);
      addFact("sharedDefinedBy", report.shared?.definedBy);
      addFact("singleton", report.shared?.singleton);
      addFact("strictVersion", report.shared?.strictVersion);
      addFact("eager", report.shared?.eager);
      addFact("sharedReason", report.shared?.reason);
      addFact("componentName", report.events.find(isComponentLoadedEvent)?.componentName);
      addFact("moduleInfoReason", report.moduleInfo?.reason);
      addFact("moduleInfoTotalCount", report.moduleInfo?.totalCount);
      addFact("moduleInfoMatchedCount", report.moduleInfo?.matchedCount);
      addFact("moduleInfoNames", report.moduleInfo?.entries.length ? report.moduleInfo.entries.map((entry) => entry.name) : report.moduleInfo?.availableNames);
      addFact("cached", report.summary.flags.cached);
      addFact("fallback", report.summary.flags.fallback);
      addFact("recovered", report.summary.recovered);
      addFact("loadCompleted", report.summary.loadCompleted);
      addFact("runtimeLoaded", report.summary.runtimeLoaded);
      addFact("componentLoaded", report.summary.componentLoaded);
      return clipMetadata(facts, MAX_FACT_KEYS) || {};
    };
    const createDiagnosisWarnings = (report) => {
      const warnings = [];
      if (report.status === "error" && !report.errorCode) warnings.push("No known Module Federation error code was captured");
      if (report.summary.flags.fallback) warnings.push("Remote loading completed through fallback recovery");
      if (report.summary.runtimeLoaded && !report.summary.componentLoaded) warnings.push("Business component readiness signal was not recorded");
      if (report.moduleInfo && report.moduleInfo.matchedCount === 0) warnings.push("No matching clipped moduleInfo entry was found for the failed remote");
      if (report.shared?.reason === SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON) warnings.push("Singleton shared dependency has multiple versions in the same share scope");
      return warnings;
    };
    const createDiagnosisActions = (report, ownerHint) => {
      const actions = [];
      const pushAction = (id, title, hint = ownerHint, detail) => {
        actions.push({
          id,
          ownerHint: hint,
          title,
          detail
        });
      };
      if (report.shared?.reason === SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON) {
        pushAction("check-shared-version", "Align singleton shared dependency versions in the same share scope", "shared");
        pushAction("check-shared-provider", "Check which host or remote registered each shared version", "shared");
        return actions;
      }
      if (report.status !== "error" && !report.summary.error) return actions;
      switch (report.errorCode) {
        case "RUNTIME-001":
          pushAction("check-remote-global", "Check the remote global name against the remoteEntry build output", "remote");
          pushAction("check-remote-entry", "Check that remoteEntry registers the expected container", "remote");
          break;
        case "RUNTIME-003":
          pushAction("check-manifest-url", "Check the manifest URL and manifest JSON response", "host");
          pushAction("check-network", "Check network availability, CORS, and timeout for the manifest", "network");
          break;
        case "RUNTIME-013":
          pushAction("check-manifest-url", "Check that the manifest response is valid Module Federation JSON", "remote");
          break;
        case "RUNTIME-004":
          pushAction("check-host-remotes", "Check that the requested remote exists in host remotes", "host");
          break;
        case "RUNTIME-007":
          pushAction("check-module-info", "Check deployment-provided __FEDERATION__.moduleInfo for the requested remote", "host");
          pushAction("check-host-remotes", "Check that the runtime remote name or alias matches moduleInfo", "host");
          break;
        case "RUNTIME-014":
          pushAction("check-expose", "Check that the requested expose exists in the remote build output", "remote");
          break;
        case "RUNTIME-015":
          pushAction("check-remote-entry", "Check the error thrown during remoteEntry init", "remote");
          pushAction("check-shared-provider", "Check share scope initialization data passed to the remote", "shared");
          break;
        case "RUNTIME-005":
        case "RUNTIME-006":
          pushAction("check-shared-provider", "Check that a compatible shared provider is available", "shared");
          pushAction("check-shared-version", "Compare requested shared version with available versions", "shared");
          if (report.summary.error?.lifecycle === "loadShareSync" || report.shared?.reason === "sync-async-boundary" || report.shared?.eager === false) pushAction("check-eager-config", "Check eager configuration or add an async boundary before sync shared consumption", "shared");
          break;
        case "RUNTIME-008": {
          const resourceErrorType = getDiagnosisResourceErrorType(report);
          if (resourceErrorType === "network" || resourceErrorType === "timeout") pushAction("check-network", "Check remoteEntry URL, CORS, status code, and timeout", "network");
          pushAction("check-remote-entry", resourceErrorType === "script-execution" ? "Check remoteEntry execution errors in the remote build output" : "Check that remoteEntry is reachable and serves JavaScript", resourceErrorType === "network" || resourceErrorType === "timeout" ? "network" : "remote");
          break;
        }
        default:
          if (report.failedPhase === "manifest") pushAction("check-manifest-url", "Check manifest loading and parsing", "host");
          if (report.failedPhase === "remoteEntry") pushAction("check-remote-entry", "Check remoteEntry loading and initialization", "remote");
          if (report.failedPhase === "expose") pushAction("check-expose", "Check that the requested expose exists in the remote", "remote");
          if (report.failedPhase === "shared") {
            pushAction("check-shared-provider", "Check shared dependency resolution", "shared");
            if (report.shared?.requiredVersion !== void 0 || report.shared?.availableVersions?.length || report.shared?.reason === "version-mismatch") pushAction("check-shared-version", "Compare requested shared version with available versions", "shared");
            if (report.summary.error?.lifecycle === "loadShareSync" || report.shared?.reason === "sync-async-boundary" || report.shared?.eager === false) pushAction("check-eager-config", "Check eager configuration or add an async boundary before sync shared consumption", "shared");
          }
      }
      if (report.moduleInfo && !actions.some((action) => action.id === "check-module-info")) pushAction("check-module-info", "Check deployment-provided __FEDERATION__.moduleInfo for the requested remote", "host");
      if (!actions.length) pushAction("inspect-runtime-events", "Inspect the ordered observability events for the failed phase", ownerHint);
      return actions;
    };
    const createFactReport = (report) => {
      const ownerHint = getDiagnosisOwnerHint(report);
      const warnings = createDiagnosisWarnings(report);
      return {
        title: getDiagnosisTitle(report),
        outcome: report.summary.outcome,
        status: report.status,
        ownerHint,
        failedPhase: report.failedPhase || report.summary.error?.failedPhase,
        errorCode: report.errorCode || report.summary.error?.errorCode,
        errorName: report.errorName || report.summary.error?.errorName,
        errorMessage: report.errorMessage || report.summary.error?.errorMessage,
        docLink: getDiagnosisDocLink(report),
        facts: createDiagnosisFacts(report, ownerHint),
        completedPhases: getCompletedPhases(report),
        pendingPhases: getPendingPhases(report),
        warnings: warnings.length ? warnings : void 0,
        actions: createDiagnosisActions(report, ownerHint)
      };
    };
    const refreshReportDerivedFields = (report) => {
      report.summary = createReportSummary2(report);
      refreshModuleInfoSummary(report);
      report.diagnosis = createFactReport(report);
    };
    const updateReport = (event) => {
      let report = reports.get(event.traceId);
      if (!report) {
        report = {
          traceId: event.traceId,
          instanceRef: event.instanceRef,
          status: event.status === "error" ? "error" : "pending",
          requestId: event.requestId,
          requestAlias: event.requestAlias,
          hostName: event.hostName,
          runtimeVersion: event.runtimeVersion,
          remote: event.remote ? { ...event.remote } : void 0,
          shared: event.shared ? copyEvent(event).shared : void 0,
          expose: event.expose,
          sanitizedUrl: event.sanitizedUrl,
          startedAt: event.timestamp,
          updatedAt: event.timestamp,
          duration: 0,
          failedPhase: event.status === "error" ? event.phase : void 0,
          errorCode: event.errorCode,
          errorName: event.errorName,
          errorMessage: event.errorMessage,
          errorStack: event.errorStack,
          ownerHint: event.ownerHint,
          retryable: event.retryable,
          errorContext: event.errorContext ? { ...event.errorContext } : void 0,
          loadedBefore: copyLoadedBeforeInfo(event.loadedBefore),
          bridge: copyBridgeInfo(event.bridge),
          events: [],
          summary: {
            eventCount: 0,
            recovered: false,
            loadCompleted: false,
            runtimeLoaded: false,
            sharedResolved: false,
            sharedRegistered: false,
            preloaded: false,
            componentLoaded: false,
            outcome: "pending",
            lastPhase: void 0,
            phases: {},
            shared: void 0,
            flags: createEmptyPhaseCollection().flags,
            error: void 0
          }
        };
        reports.set(event.traceId, report);
      }
      if (event.instanceRef) report.instanceRef = event.instanceRef;
      if (event.requestId) report.requestId = event.requestId;
      if (event.requestAlias) report.requestAlias = event.requestAlias;
      if (event.hostName) report.hostName = event.hostName;
      if (event.runtimeVersion) report.runtimeVersion = event.runtimeVersion;
      if (event.remote) report.remote = { ...event.remote };
      if (event.shared) report.shared = copyEvent(event).shared;
      if (event.expose) report.expose = event.expose;
      if (event.sanitizedUrl) report.sanitizedUrl = event.sanitizedUrl;
      if (event.errorStack) report.errorStack = event.errorStack;
      if (event.errorCode) report.errorCode = event.errorCode;
      if (event.errorName) report.errorName = event.errorName;
      if (event.errorMessage) report.errorMessage = event.errorMessage;
      if (event.ownerHint) report.ownerHint = event.ownerHint;
      if (event.retryable !== void 0) report.retryable = event.retryable;
      if (event.errorContext) report.errorContext = { ...event.errorContext };
      if (event.loadedBefore) report.loadedBefore = copyLoadedBeforeInfo(event.loadedBefore);
      if (event.bridge) report.bridge = copyBridgeInfo(event.bridge);
      report.events.push(event);
      report.updatedAt = event.timestamp;
      report.duration = Math.max(0, report.updatedAt - report.startedAt);
      const eventOutcome = getEventOutcome(event);
      if (eventOutcome === "error") {
        report.status = "error";
        if (shouldReplaceFailedPhase(report, event)) report.failedPhase = event.phase;
      } else if (eventOutcome === "recovered") report.status = "success";
      else if (eventOutcome === "success" && report.status !== "error") report.status = "success";
      refreshReportDerivedFields(report);
      latestTraceId = event.traceId;
      if (event.instanceRef) latestTraceByInstance.set(event.instanceRef, event.traceId);
      trimEvents(report);
      return report;
    };
    const getEventsSnapshot = () => events.map(copyEvent);
    const getTraceIdsSnapshot = () => Array.from(reports.keys());
    const getReportTimeline = () => Array.from(reports.values()).sort((left, right) => {
      if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt;
      return right.startedAt - left.startedAt;
    });
    const matchesReportValue = (value, expected) => {
      if (!value || !expected) return false;
      const normalizedValue = value.toLowerCase();
      const normalizedExpected = expected.toLowerCase();
      return normalizedValue === normalizedExpected || normalizedValue.includes(normalizedExpected);
    };
    const matchesReportQuery = (report, query) => {
      if (query.traceId && report.traceId !== query.traceId) return false;
      if (query.instanceRef && report.instanceRef !== query.instanceRef) return false;
      if (query.status && report.status !== query.status) return false;
      if (query.outcome && report.summary.outcome !== query.outcome) return false;
      if (query.remote && ![
        report.remote?.name,
        report.remote?.alias,
        report.remote?.entry,
        report.requestId,
        report.requestAlias,
        report.sanitizedUrl
      ].some((value) => matchesReportValue(value, query.remote))) return false;
      if (query.expose && ![report.expose, report.requestId].some((value) => matchesReportValue(value, query.expose))) return false;
      if (query.shared && ![report.shared?.name].some((value) => matchesReportValue(value, query.shared))) return false;
      return true;
    };
    const getReportsSnapshot = (options2 = {}) => {
      const limit = normalizeQueryLimit(options2.limit);
      const timeline = getReportTimeline();
      return (limit ? timeline.slice(0, limit) : timeline).map(copyReport);
    };
    const findReportsSnapshot = (query = {}) => {
      const limit = normalizeQueryLimit(query.limit);
      const matchedReports = getReportTimeline().filter((report) => matchesReportQuery(report, query));
      return (limit ? matchedReports.slice(0, limit) : matchedReports).map(copyReport);
    };
    const getLatestReportSnapshot = () => {
      if (!latestTraceId) return;
      const report = reports.get(latestTraceId);
      return report ? copyReport(report) : void 0;
    };
    const getReportSnapshot = (traceId) => {
      const report = reports.get(traceId);
      return report ? copyReport(report) : void 0;
    };
    const exportReportSnapshot = (traceId) => traceId ? getReportSnapshot(traceId) : getLatestReportSnapshot();
    const getTraceIdForRequest = (instanceRef, requestId) => requestId ? traceByRequest.get(getTraceMapKey(instanceRef, requestId)) : void 0;
    const getLatestTraceId = (instanceRef) => instanceRef ? latestTraceByInstance.get(instanceRef) : latestTraceId;
    const clear = () => {
      events.length = 0;
      reports.clear();
      traceByRequest.clear();
      traceByRemote.clear();
      traceByBridgeOperation.clear();
      traceByBridgeId.clear();
      latestTraceByInstance.clear();
      phaseStartTimes.clear();
      latestTraceId = void 0;
      effectiveMaxEvents = configuredMaxEvents;
    };
    return {
      events,
      resolveTraceId,
      normalizeEvent: normalizeEvent2,
      applyPhaseDuration,
      updateTraceMaps,
      getEventOutcome,
      updateReport,
      getEventsSnapshot,
      getTraceIdsSnapshot,
      getReportsSnapshot,
      findReportsSnapshot,
      getLatestReportSnapshot,
      getReportSnapshot,
      exportReportSnapshot,
      getTraceIdForRequest,
      getLatestTraceId,
      clear
    };
  }
  function normalizeBridgeInfo(bridge, timing) {
    if (!bridge?.operationId || !bridge.bridgeId) return;
    const moduleName = sanitizeText(bridge.moduleName, 160);
    const slashIndex = moduleName?.indexOf("/") ?? -1;
    const remote = sanitizeText(bridge.remote, 120) || (moduleName ? slashIndex > 0 ? moduleName.slice(0, slashIndex) : moduleName : void 0);
    const expose = sanitizeText(bridge.expose, 240) || (moduleName && slashIndex > 0 ? `./${moduleName.slice(slashIndex + 1).replace(/^\.\//, "")}` : void 0);
    const errorInfo = getErrorInfo(bridge.error);
    return omitUndefinedFields({
      operationId: sanitizeText(bridge.operationId, 120) || bridge.operationId,
      bridgeId: sanitizeText(bridge.bridgeId, 120) || bridge.bridgeId,
      side: bridge.side,
      framework: bridge.framework,
      operation: bridge.operation,
      moduleName,
      remote,
      expose,
      route: bridge.route ? {
        action: sanitizeText(bridge.route.action, 80) || "route-update",
        from: sanitizeUrl(bridge.route.from),
        to: sanitizeUrl(bridge.route.to),
        basename: sanitizeUrl(bridge.route.basename),
        mechanism: bridge.route.mechanism
      } : void 0,
      reason: sanitizeText(bridge.reason, 80),
      startedAt: timing.startedAt,
      endedAt: timing.endedAt,
      duration: timing.duration,
      outcome: bridge.outcome,
      error: bridge.error ? {
        name: sanitizeText(errorInfo.errorName, 80),
        message: sanitizeText(errorInfo.errorMessage, 240)
      } : void 0
    });
  }
  function continuePreloadAssetsGeneration() {
  }
  function isReactLike(value) {
    if (!isRecord(value)) return false;
    return typeof getObjectValue(value, "createElement") === "function";
  }
  function resolveReactLike(value) {
    if (isReactLike(value)) return value;
    if (isRecord(value)) {
      const defaultExport = getObjectValue(value, "default");
      if (isReactLike(defaultExport)) return defaultExport;
    }
  }
  function getReactComponentName(component, fallback) {
    if (typeof component === "function") return component.displayName || component.name || fallback;
    if (!isRecord(component)) return fallback;
    const displayName = getObjectValue(component, "displayName");
    if (typeof displayName === "string" && displayName) return displayName;
    const render = getObjectValue(component, "render");
    if (typeof render === "function") {
      const renderFunction = render;
      return renderFunction.displayName || renderFunction.name || fallback;
    }
    return fallback;
  }
  function isLikelyReactFunctionComponent(component, allowAnonymousComponent = false) {
    if (typeof component !== "function") return false;
    const name = component.displayName || component.name || "";
    if (/^use[A-Z0-9]/.test(name)) return false;
    if (allowAnonymousComponent) return true;
    if (!name) return false;
    return /^[A-Z]/.test(name);
  }
  function copyComponentStatics(target, source) {
    const reserved = /* @__PURE__ */ new Set([
      "arguments",
      "caller",
      "length",
      "name",
      "prototype",
      "displayName"
    ]);
    Object.getOwnPropertyNames(source).forEach((key) => {
      if (reserved.has(key)) return;
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (!descriptor || !descriptor.configurable) return;
      try {
        Object.defineProperty(target, key, descriptor);
      } catch {
      }
    });
  }
  function cloneModuleWithDefaultExport(moduleExports, defaultExport) {
    const descriptors = Object.getOwnPropertyDescriptors(moduleExports);
    descriptors["default"] = {
      configurable: true,
      enumerable: descriptors["default"]?.enumerable ?? true,
      writable: true,
      value: defaultExport
    };
    return Object.defineProperties(Object.create(Object.getPrototypeOf(moduleExports)), descriptors);
  }
  function resolveReactComponentTarget(component, defaultExportMode = "preserve", allowAnonymousComponent = false) {
    if (isLikelyReactFunctionComponent(component, allowAnonymousComponent)) return {
      component,
      createResult: (wrappedComponent) => wrappedComponent
    };
    if (!isRecord(component)) return;
    const defaultExport = getObjectValue(component, "default");
    if (!isLikelyReactFunctionComponent(defaultExport, allowAnonymousComponent)) return;
    return {
      component: defaultExport,
      createResult: (wrappedComponent) => {
        const descriptor = Object.getOwnPropertyDescriptor(component, "default");
        let defaultExportReplaced = false;
        try {
          if (!descriptor || descriptor.writable || descriptor.set) {
            component["default"] = wrappedComponent;
            defaultExportReplaced = true;
          } else if (descriptor.configurable) {
            Object.defineProperty(component, "default", {
              configurable: true,
              enumerable: descriptor.enumerable,
              writable: true,
              value: wrappedComponent
            });
            defaultExportReplaced = true;
          }
        } catch {
        }
        if (defaultExportMode === "component") return wrappedComponent;
        return defaultExportReplaced ? void 0 : cloneModuleWithDefaultExport(component, wrappedComponent);
      }
    };
  }
  function createRuntimeStateManager({ options, events, instancesByRef, lateBoundInstanceRefs, boundInstanceRefs, getActiveRuntimeInstances, registerRuntimeInstance, getInstanceRef, getBrowserGlobalScope, getHistoryCleared, supportsSemanticResourceLifecycle }) {
    const bridgeStatesByInstance = /* @__PURE__ */ new Map();
    const createStateRemote = (value, fallbackName) => {
      if (typeof value === "string") return {
        name: fallbackName || sanitizeText(value, 120) || "unknown",
        entry: sanitizeUrl(value)
      };
      if (!isRecord(value)) return fallbackName ? { name: fallbackName } : void 0;
      const name = sanitizeText(getObjectValue(value, "name"), 120) || sanitizeText(fallbackName, 120);
      if (!name) return;
      return omitUndefinedFields({
        name,
        alias: sanitizeText(getObjectValue(value, "alias"), 120),
        version: sanitizeText(getObjectValue(value, "version"), 120),
        entry: sanitizeUrl(sanitizeText(getObjectValue(value, "entry") || getObjectValue(value, "remoteEntry") || getObjectValue(value, "manifestUrl"), 320)),
        entryGlobalName: sanitizeText(getObjectValue(value, "entryGlobalName") || getObjectValue(value, "globalName"), 120),
        type: sanitizeText(getObjectValue(value, "type"), 80)
      });
    };
    const getDeclaredRemotes = (origin) => {
      const remotes = origin.options?.remotes;
      return (Array.isArray(remotes) ? remotes.map((value) => [void 0, value]) : isRecord(remotes) ? Object.entries(remotes) : []).map(([name, value]) => createStateRemote(value, name)).filter((remote) => remote !== void 0);
    };
    const getLoadedProducerRemotes = (origin) => getModuleCacheEntries(origin.moduleCache).map((module) => createStateRemote(isRecord(module) ? getObjectValue(module, "remoteInfo") : void 0)).filter((remote) => remote !== void 0);
    const getShareScopeSummaries = (origin) => Object.entries(getOriginShareScopeMap(origin)).map(([name, scope]) => {
      const sharedEntries = Object.entries(scope || {}).map(([rawName, versions]) => ({
        rawName,
        name: sanitizeText(rawName, 160) || "unknown",
        versions: getRuntimeSharedVersionEntries(versions)
      })).filter((entry) => entry.versions.length > 0).sort((left, right) => left.rawName.localeCompare(right.rawName)).slice(0, 100);
      return {
        name: sanitizeText(name, 120) || "default",
        sharedCount: sharedEntries.length,
        sharedNames: sharedEntries.map((entry) => entry.name),
        shared: sharedEntries.map((entry) => ({
          name: entry.name,
          versions: entry.versions.slice(0, 20).map(([version, shared]) => omitUndefinedFields({
            version: sanitizeText(version, 120) || version,
            provider: sanitizeText(shared.from, 160),
            loaded: shared.loaded === true || void 0,
            singleton: shared.shareConfig?.singleton || void 0,
            eager: shared.shareConfig?.eager || void 0,
            strategy: sanitizeText(shared.strategy, 80)
          }))
        }))
      };
    });
    const updateBridgeState = (origin, bridge, signal) => {
      const instanceRef = getInstanceRef(origin);
      if (!instanceRef) return;
      let states = bridgeStatesByInstance.get(instanceRef);
      if (!states) {
        states = /* @__PURE__ */ new Map();
        bridgeStatesByInstance.set(instanceRef, states);
      }
      const key = `${bridge.bridgeId}\0${bridge.side}`;
      const previous = states.get(key);
      let status = previous?.status || "idle";
      if (signal === "start") {
        if (bridge.operation === "destroy") status = "destroying";
        else if (bridge.operation === "render" || bridge.operation === "update") status = "rendering";
      } else if (signal === "result") {
        if (bridge.outcome === "error") status = "error";
        else if (bridge.operation === "destroy") status = "destroyed";
        else if (bridge.operation === "render" || bridge.operation === "update") status = "rendered";
      }
      states.set(key, {
        bridgeId: bridge.bridgeId,
        side: bridge.side,
        framework: bridge.framework,
        moduleName: bridge.moduleName || previous?.moduleName,
        remote: bridge.remote || previous?.remote,
        expose: bridge.expose || previous?.expose,
        status,
        lastOperation: bridge.operation,
        lastOperationId: bridge.operationId,
        lastOperationAt: bridge.endedAt || bridge.startedAt,
        routeSyncObserved: bridge.operation === "route-sync" || previous?.routeSyncObserved === true
      });
    };
    const getBridgeSummary = (origin, instanceRef) => {
      if (!isRecord(origin.bridgeHook)) return;
      const lifecycle = getObjectValue(origin.bridgeHook, "lifecycle");
      const states = Array.from(bridgeStatesByInstance.get(instanceRef)?.values() || []).sort((left, right) => (right.lastOperationAt || 0) - (left.lastOperationAt || 0)).map((state) => ({ ...state }));
      const latest = states[0];
      return {
        available: true,
        lifecycleCount: isRecord(lifecycle) ? Object.keys(lifecycle).length : void 0,
        framework: latest?.framework,
        moduleName: latest?.moduleName,
        remote: latest?.remote,
        expose: latest?.expose,
        status: latest?.status || "idle",
        lastOperationAt: latest?.lastOperationAt,
        routeSyncObserved: states.some((state) => state.routeSyncObserved),
        states
      };
    };
    const getRuntimeModuleInfo = () => {
      const moduleInfo = getFederationGlobal()?.moduleInfo || {};
      return Object.entries(moduleInfo).map(([key, value]) => {
        const record = isRecord(value) ? value : {};
        const rawRemotes = getObjectValue(record, "remotes");
        const remotes = (Array.isArray(rawRemotes) ? rawRemotes.map((remote) => [void 0, remote]) : isRecord(rawRemotes) ? Object.entries(rawRemotes) : []).map(([name, remote]) => createStateRemote(remote, name)).filter((remote) => remote !== void 0);
        return omitUndefinedFields({
          key: sanitizeText(key, 160) || key,
          name: sanitizeText(getObjectValue(record, "name"), 120),
          version: sanitizeText(getObjectValue(record, "version") || getObjectValue(record, "buildVersion"), 120),
          entry: sanitizeUrl(sanitizeText(getObjectValue(record, "entry") || getObjectValue(record, "remoteEntry") || getObjectValue(record, "manifestUrl"), 320)),
          tag: sanitizeText(getObjectValue(record, "tag"), 120),
          remotes: remotes.length ? remotes : void 0
        });
      }).slice(0, MAX_MODULE_INFO_ENTRIES);
    };
    const getRuntimeFrame = () => {
      try {
        return typeof window === "undefined" ? void 0 : window === window.top ? "top" : "child";
      } catch {
        return "child";
      }
    };
    const getRuntimeStateSnapshot = () => {
      const activeInstances = getActiveRuntimeInstances();
      activeInstances.forEach((instance) => registerRuntimeInstance(instance));
      const moduleInfo = getRuntimeModuleInfo();
      const instanceDrafts = Array.from(instancesByRef.entries()).map(([instanceRef, origin]) => ({
        instanceRef,
        origin,
        name: sanitizeText(origin.name, 120) || sanitizeText(origin.options?.name, 120),
        optionsName: sanitizeText(origin.options?.name, 120),
        optionsVersion: sanitizeText(origin.options?.version, 120),
        runtimeVersion: sanitizeText(origin.version, 80),
        remotes: getDeclaredRemotes(origin),
        loadedProducers: getLoadedProducerRemotes(origin),
        consumerEvidence: [],
        producerEvidence: []
      }));
      instanceDrafts.forEach((draft) => {
        const matchingModuleInfo = moduleInfo.filter((info) => {
          return [draft.name, draft.optionsName].filter((name) => Boolean(name)).some((name) => info.name === name || info.key === name || info.key.includes(name) && (!draft.optionsVersion || info.version === draft.optionsVersion || info.key.includes(draft.optionsVersion)));
        });
        if (draft.remotes.length) draft.consumerEvidence.push("options.remotes");
        if (draft.loadedProducers.length) draft.consumerEvidence.push("moduleCache.remoteInfo");
        if (matchingModuleInfo.some((info) => info.remotes?.length)) draft.consumerEvidence.push("moduleInfo.remotes");
        if (matchingModuleInfo.length) draft.producerEvidence.push("moduleInfo");
      });
      const relationships = [];
      instanceDrafts.forEach((consumer) => {
        consumer.loadedProducers.forEach((remote) => {
          const matchingModuleInfo = moduleInfo.filter((info) => info.name === remote.name || info.key === remote.name || Boolean(remote.entry && info.entry === remote.entry) || Boolean(remote.version && info.version === remote.version));
          const candidates = instanceDrafts.filter((producer) => {
            if (producer.instanceRef === consumer.instanceRef) return false;
            const names = new Set([producer.name, producer.optionsName].filter((name) => Boolean(name)));
            const directNameMatches = names.has(remote.name) || Boolean(remote.alias && names.has(remote.alias));
            const moduleInfoMatches = matchingModuleInfo.some((info) => Boolean(info.name && names.has(info.name)) || names.has(info.key) || Boolean(info.version && producer.optionsVersion === info.version));
            const versionMatches = !remote.version || !producer.optionsVersion || producer.optionsVersion === remote.version;
            return (directNameMatches || moduleInfoMatches) && versionMatches;
          });
          const status = candidates.length === 1 ? "resolved" : candidates.length > 1 ? "ambiguous" : "unresolved";
          candidates.forEach((candidate) => {
            if (!candidate.producerEvidence.includes("consumer.moduleCache")) candidate.producerEvidence.push("consumer.moduleCache");
          });
          relationships.push(omitUndefinedFields({
            consumerInstanceRef: consumer.instanceRef,
            producerInstanceRef: candidates.length === 1 ? candidates[0].instanceRef : void 0,
            candidateProducerInstanceRefs: candidates.length > 1 ? candidates.map((candidate) => candidate.instanceRef) : void 0,
            remote,
            evidence: ["moduleCache.remoteInfo"],
            status
          }));
        });
      });
      const instances = instanceDrafts.map((draft) => {
        const isConsumer = draft.consumerEvidence.length > 0;
        const isProducer = draft.producerEvidence.length > 0;
        const role = isConsumer && isProducer ? "mixed" : isConsumer ? "consumer" : isProducer ? "producer" : "unknown";
        return omitUndefinedFields({
          instanceRef: draft.instanceRef,
          name: draft.name,
          optionsName: draft.optionsName,
          optionsVersion: draft.optionsVersion,
          runtimeVersion: draft.runtimeVersion,
          role,
          roleEvidence: {
            consumer: [...draft.consumerEvidence],
            producer: [...draft.producerEvidence]
          },
          remotes: draft.remotes,
          loadedProducers: draft.loadedProducers,
          shareScopes: getShareScopeSummaries(draft.origin),
          bridge: getBridgeSummary(draft.origin, draft.instanceRef),
          active: activeInstances.includes(draft.origin)
        });
      });
      const hasLateBinding = lateBoundInstanceRefs.size > 0;
      const historyCleared = getHistoryCleared();
      const hasIncompleteHistory = hasLateBinding || historyCleared;
      const hasStableSharedRuntime = instanceDrafts.some((draft) => supportsRuntimeObservability(draft.origin));
      const hasSharedState = instances.some((instance) => instance.shareScopes.length > 0);
      const hasRemoteSignals = events.some((event) => Boolean(event.remote));
      const hasSharedSignals = events.some((event) => Boolean(event.shared));
      const hasDetailedSharedSignals = events.some((event) => Boolean(event.shared?.selectionReason) || Boolean(event.shared?.registration));
      const hasDetailedSharedHooks = instanceDrafts.some((draft) => Boolean(draft.origin.sharedHandler?.hooks?.lifecycle?.["afterRegisterShare"]));
      const hasBridge = instances.some((instance) => instance.bridge?.available);
      const hasBridgeSignals = events.filter((event) => Boolean(event.bridge)).length > 0;
      const traceCompleteness = hasIncompleteHistory ? "partial" : "complete";
      const hasResourceLifecycle = instanceDrafts.some((draft) => supportsSemanticResourceLifecycle(draft.origin));
      const remoteTraceCompleteness = hasIncompleteHistory || !hasResourceLifecycle ? "partial" : "complete";
      return omitUndefinedFields({
        schemaVersion: 1,
        observedAt: Date.now(),
        scope: {
          name: getBrowserGlobalScope() || normalizeScope(options.browser?.scope),
          realm: "current",
          frame: getRuntimeFrame()
        },
        completeness: {
          currentState: "complete",
          history: hasIncompleteHistory ? "partial" : "complete",
          historyCleared,
          lateBoundInstanceRefs: Array.from(lateBoundInstanceRefs),
          recommendation: hasIncompleteHistory ? "Reload or reopen the page to capture complete runtime history." : void 0
        },
        capabilities: {
          instanceState: {
            available: true,
            completeness: "complete"
          },
          remoteTrace: {
            available: hasRemoteSignals || boundInstanceRefs.size > 0,
            completeness: remoteTraceCompleteness,
            reason: !hasResourceLifecycle ? "Runtime resource completion hooks are unavailable; remote resource history may be incomplete." : hasRemoteSignals ? void 0 : "No remote lifecycle signal has been observed yet."
          },
          sharedState: {
            available: hasSharedState,
            completeness: hasSharedState ? "complete" : "unavailable"
          },
          sharedTrace: {
            available: hasStableSharedRuntime && hasSharedSignals,
            completeness: hasStableSharedRuntime && hasSharedSignals ? hasDetailedSharedHooks && hasDetailedSharedSignals ? traceCompleteness : "partial" : "unavailable",
            reason: hasStableSharedRuntime ? hasSharedSignals ? hasDetailedSharedHooks && hasDetailedSharedSignals ? void 0 : "Shared history is available, but detailed registration or selection results are missing." : "No shared lifecycle signal has been observed yet." : "Shared tracing requires a stable runtime version of 2.5.0 or newer."
          },
          bridgeTrace: {
            available: hasBridgeSignals,
            completeness: !hasBridgeSignals ? "unavailable" : hasIncompleteHistory ? "partial" : "complete",
            reason: !hasBridgeSignals ? hasBridge ? "Bridge is present, but no Bridge lifecycle signal has been observed." : "Bridge is not present on an observed instance." : hasIncompleteHistory ? "runtime history is incomplete" : void 0
          }
        },
        instances,
        relationships,
        moduleInfo
      });
    };
    return {
      getRuntimeStateSnapshot,
      updateBridgeState
    };
  }
  function createObservability(rawOptions = {}, adapterOptions = {}) {
    const options = {
      ...rawOptions,
      browser: adapterOptions.fixedBrowserScope ? {
        ...rawOptions.browser,
        scope: adapterOptions.fixedBrowserScope
      } : rawOptions.browser,
      react: adapterOptions.disableReact ? {
        ...rawOptions.react,
        enabled: false,
        injectLoadedCallback: false
      } : rawOptions.react
    };
    const pluginName = adapterOptions.pluginName || "observability-plugin";
    const shouldAttachInstanceApi = adapterOptions.attachInstanceApi !== false;
    const shouldGuardSharedHooksByRuntimeVersion = adapterOptions.guardSharedHooksByRuntimeVersion === true;
    const shouldGuardRuntimeHooksByRuntimeVersion = adapterOptions.guardRuntimeHooksByRuntimeVersion === true;
    const shouldDisablePreloadHooks = adapterOptions.disablePreloadHooks === true;
    const shouldReturnHookArgs = adapterOptions.returnHookArgs === true;
    const shouldForceDevelopmentChannels = adapterOptions.forceDevelopmentChannels === true;
    const returnHookArgs = (args) => shouldReturnHookArgs ? args : void 0;
    const level = options.level || "summary";
    const configuredMaxEvents = normalizeMaxEvents(options.maxEvents, DEFAULT_MAX_EVENTS);
    const bridgeStartTimes = /* @__PURE__ */ new Map();
    const bridgeOperations = /* @__PURE__ */ new WeakMap();
    const bridgeContexts = /* @__PURE__ */ new WeakMap();
    const bridgeIdsByTarget = /* @__PURE__ */ new WeakMap();
    const bridgeIdsByFallback = /* @__PURE__ */ new Map();
    const latestBridgeOperations = /* @__PURE__ */ new Map();
    const resourceStartTimes = /* @__PURE__ */ new Map();
    const sharedSelections = /* @__PURE__ */ new Map();
    let sharedOperationIdsByContext = /* @__PURE__ */ new WeakMap();
    const instanceRefs = /* @__PURE__ */ new WeakMap();
    const instancesByRef = /* @__PURE__ */ new Map();
    const lateBoundInstanceRefs = /* @__PURE__ */ new Set();
    const boundInstanceRefs = /* @__PURE__ */ new Set();
    const attachedInstanceApis = /* @__PURE__ */ new WeakMap();
    const reportedSharedConflictKeys = /* @__PURE__ */ new Set();
    const reportedBridgeProviderKeys = /* @__PURE__ */ new Set();
    const collectorOptions = normalizeCollectorOptions(options.collector);
    const devtoolsOptions = normalizeDevtoolsOptions(options.devtools);
    const seenManifestUrls = /* @__PURE__ */ new Set();
    const loadingManifestUrls = /* @__PURE__ */ new Set();
    const seenRemoteEntryKeys = /* @__PURE__ */ new Set();
    const consoleReportedTraceIds = /* @__PURE__ */ new Set();
    const consoleReportedStartKeys = /* @__PURE__ */ new Set();
    let runtimeObservabilityEnabled = false;
    let suppressRuntimeEvents = false;
    let browserGlobalScope;
    let lastRuntimeOrigin;
    let appliedRuntimeVersion;
    let instanceRefCounter = 0;
    let sharedOperationCounter = 0;
    let sharedRegistrationCounter = 0;
    let bridgeOperationCounter = 0;
    let bridgeCounter = 0;
    let bridgeObservedAt = 0;
    let historyCleared = false;
    const getActiveRuntimeInstances = () => {
      const federation = getFederationGlobal();
      return Array.isArray(federation?.__INSTANCES__) ? federation.__INSTANCES__ : [];
    };
    const registerRuntimeInstance = (origin, lateBound) => {
      const existingRef = instanceRefs.get(origin);
      if (existingRef) return existingRef;
      instanceRefCounter += 1;
      const instanceRef = `mf-${instanceRefCounter}`;
      instanceRefs.set(origin, instanceRef);
      instancesByRef.set(instanceRef, origin);
      if (lateBound ?? getActiveRuntimeInstances().some((instance) => instance === origin)) lateBoundInstanceRefs.add(instanceRef);
      return instanceRef;
    };
    const getInstanceRef = (origin) => origin ? registerRuntimeInstance(origin) : void 0;
    const reportManager = createReportManager({
      options,
      configuredMaxEvents,
      getInstanceRef,
      getAppliedRuntimeVersion: () => appliedRuntimeVersion
    });
    const { events, resolveTraceId, normalizeEvent: normalizeEvent2, applyPhaseDuration, updateTraceMaps, getEventOutcome, updateReport, getEventsSnapshot, getTraceIdsSnapshot, getReportsSnapshot, findReportsSnapshot, getLatestReportSnapshot, getReportSnapshot, exportReportSnapshot } = reportManager;
    const isEnabled = () => {
      if (options.enabled === false) return false;
      runtimeObservabilityEnabled = true;
      return true;
    };
    const supportsRuntimeHookObservability = (origin) => supportsRuntimeObservability({
      ...origin,
      version: sanitizeText(origin?.version, 80) || appliedRuntimeVersion || origin?.version
    });
    const shouldSkipRuntimeHook = (origin) => shouldGuardRuntimeHooksByRuntimeVersion && !supportsRuntimeHookObservability(origin);
    const supportsManifestResultLifecycle = (origin) => Boolean(origin?.snapshotHandler?.hooks?.lifecycle?.afterLoadManifest);
    const supportsSemanticResourceLifecycle = (origin) => Boolean(supportsManifestResultLifecycle(origin) && origin?.loaderHook?.lifecycle?.afterLoadEntry);
    const { getRuntimeStateSnapshot, updateBridgeState } = createRuntimeStateManager({
      options,
      events,
      instancesByRef,
      lateBoundInstanceRefs,
      boundInstanceRefs,
      getActiveRuntimeInstances,
      registerRuntimeInstance,
      getInstanceRef,
      getBrowserGlobalScope: () => browserGlobalScope,
      getHistoryCleared: () => historyCleared,
      supportsSemanticResourceLifecycle
    });
    const notifyEvent = (event, report, origin) => {
      try {
        options.onEvent?.(copyEvent(event), copyReport(report), {
          origin,
          instanceRef: event.instanceRef
        });
      } catch {
      }
    };
    const notifyReport = (report, origin) => {
      if (report.events[report.events.length - 1]?.status === "start") return;
      try {
        options.onReport?.(copyReport(report), {
          origin,
          instanceRef: report.instanceRef
        });
      } catch {
      }
    };
    const notifyRawError = (errorValue, event, report, origin) => {
      if (!errorValue || !options.onRawError) return;
      try {
        options.onRawError(errorValue, {
          origin,
          instanceRef: event.instanceRef,
          event: copyEvent(event),
          report: copyReport(report)
        });
      } catch {
      }
    };
    const notifyCollector = (event, report) => {
      if (!collectorOptions) return;
      const fetcher = globalThis.fetch;
      if (typeof fetcher !== "function") return;
      try {
        const body = JSON.stringify({
          schemaVersion: 1,
          source: "browser",
          kind: "event",
          createdAt: Date.now(),
          event: copyEvent(event),
          report: copyReport(report)
        });
        fetcher(getCollectorUrl(collectorOptions.port), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: body.length <= 64 * 1024,
          credentials: "omit",
          mode: "cors"
        }).catch((error) => {
          logger2.debug("Failed to notify local observability collector.", error);
        });
      } catch (error) {
        logger2.debug("Failed to notify local observability collector.", error);
      }
    };
    const notifyDevtools = (event, report) => {
      if (!devtoolsOptions) return;
      const poster = globalThis.postMessage;
      if (typeof poster !== "function") return;
      try {
        poster.call(globalThis, {
          schemaVersion: 1,
          source: devtoolsOptions.source,
          kind: "event",
          createdAt: Date.now(),
          scope: browserGlobalScope || report.hostName,
          event: copyEvent(event),
          report: copyReport(report)
        }, "*");
      } catch {
      }
    };
    const divebellAdapter = createDivebellObservabilityAdapter(options.divebell, {
      getReports: getReportsSnapshot,
      findReports: findReportsSnapshot,
      getLatestReport: getLatestReportSnapshot,
      getReport: getReportSnapshot,
      exportReport: exportReportSnapshot,
      getRuntimeState: getRuntimeStateSnapshot
    });
    const createBrowserReader = () => ({
      getEvents: getEventsSnapshot,
      getTraceIds: getTraceIdsSnapshot,
      getReports: getReportsSnapshot,
      findReports: findReportsSnapshot,
      getLatestReport: getLatestReportSnapshot,
      getReport: getReportSnapshot,
      exportReport: exportReportSnapshot,
      getRuntimeState: getRuntimeStateSnapshot
    });
    const shouldExposeBrowserGlobal = () => options.browser?.enabled === true;
    const ensureBrowserGlobal = (origin) => {
      if (!shouldExposeBrowserGlobal()) return;
      const federationGlobal = getFederationGlobal();
      if (!federationGlobal) return;
      const scope = normalizeScope(options.browser?.scope || origin?.options?.name || "default");
      const reader = createBrowserReader();
      const readers = federationGlobal.__OBSERVABILITY__ || {};
      federationGlobal.__OBSERVABILITY__ = readers;
      browserGlobalScope = scope;
      try {
        Object.defineProperty(readers, scope, {
          value: reader,
          configurable: true,
          enumerable: true
        });
      } catch {
        readers[scope] = reader;
      }
    };
    const shouldUseConsole = () => options.console !== false;
    const shouldUseDevelopmentChannels = () => {
      if (shouldUseMinimalBrowserConsole()) return false;
      if (shouldForceDevelopmentChannels) return true;
      if (typeof process === "undefined" || !process.env) return true;
      return true;
    };
    const shouldNotifyCollector = () => Boolean(collectorOptions);
    const shouldNotifyDevtools = () => shouldUseDevelopmentChannels();
    const shouldUseMinimalBrowserConsole = () => options.browser?.mode === "production";
    const shouldUseStartTrace = () => options.trace?.printStart ?? (options.browser?.enabled === true && !shouldUseMinimalBrowserConsole());
    const shouldPrintStartConsole = (event) => shouldUseStartTrace() && event.status === "start" && (event.phase === "loadRemote" || event.phase === "shared") && shouldUseConsole();
    const shouldRecordStartTrace = (input) => shouldUseStartTrace() && input.status === "start" && (input.phase === "loadRemote" || input.phase === "shared");
    const shouldCollectLoadedBefore = (error) => Boolean(error) || level === "verbose" && !shouldUseMinimalBrowserConsole();
    const getBrowserReadCommand = (traceId) => {
      if (!browserGlobalScope) return;
      return `window.__FEDERATION__.__OBSERVABILITY__[${JSON.stringify(browserGlobalScope)}].getReport(${JSON.stringify(traceId)})`;
    };
    const emitConsoleHint = (event, report, rawError) => {
      if (getEventOutcome(event) !== "error" || !shouldUseConsole() || consoleReportedTraceIds.has(report.traceId)) return;
      consoleReportedTraceIds.add(report.traceId);
      if (shouldUseMinimalBrowserConsole()) {
        const lines2 = ["[Module Federation] Observability report generated", `traceId: ${report.traceId}`];
        if (report.errorCode) lines2.push(`errorCode: ${report.errorCode}`);
        try {
          console.error(lines2.join("\n"));
        } catch {
        }
        return;
      }
      const lines = [
        "[Module Federation] Observability report generated",
        `traceId: ${report.traceId}`,
        `phase: ${report.failedPhase || event.phase}`
      ];
      if (report.requestId) lines.push(`requestId: ${report.requestId}`);
      if (report.requestAlias) lines.push(`requestAlias: ${report.requestAlias}`);
      if (report.errorCode) lines.push(`errorCode: ${report.errorCode}`);
      if (report.shared?.name) lines.push(`shared: ${report.shared.name}`);
      const browserReadCommand = getBrowserReadCommand(report.traceId);
      if (browserReadCommand) lines.push(`read: ${browserReadCommand}`);
      else lines.push("read: enable browser output or use onReport(report)");
      const rawStack = getRawStack(rawError);
      if (options.printRawStack === true && rawStack) lines.push("rawStack:", rawStack);
      try {
        console.error(lines.join("\n"));
      } catch {
      }
    };
    const emitStartConsoleHint = (event, report) => {
      if (!shouldPrintStartConsole(event)) return;
      const startKey = [
        event.traceId,
        event.phase,
        event.requestId || event.shared?.name || event.remote?.name || "",
        event.lifecycle || ""
      ].join("|");
      if (consoleReportedStartKeys.has(startKey)) return;
      consoleReportedStartKeys.add(startKey);
      const lines = [
        "[Module Federation] Observability trace started",
        `traceId: ${report.traceId}`,
        `phase: ${event.phase}`
      ];
      if (event.requestId) lines.push(`requestId: ${event.requestId}`);
      if (event.requestAlias) lines.push(`requestAlias: ${event.requestAlias}`);
      if (event.remote?.name) lines.push(`remote: ${event.remote.name}`);
      if (event.shared?.name) lines.push(`shared: ${event.shared.name}`);
      if (event.lifecycle) lines.push(`lifecycle: ${event.lifecycle}`);
      const browserReadCommand = getBrowserReadCommand(report.traceId);
      if (browserReadCommand) lines.push(`read: ${browserReadCommand}`);
      else lines.push("read: enable browser output or use getReports({ limit: 10 })");
      try {
        console.info(lines.join("\n"));
      } catch {
      }
    };
    const prepareOutputChannels = (origin) => {
      browserGlobalScope = void 0;
      ensureBrowserGlobal(origin);
    };
    const prepareRuntimeOrigin = (origin) => {
      if (!isEnabled()) return false;
      lastRuntimeOrigin = origin;
      registerRuntimeInstance(origin);
      prepareOutputChannels(origin);
      return true;
    };
    const recordEvent = (input, origin) => {
      if (suppressRuntimeEvents) return;
      const effectiveInput = {
        ...input,
        instanceRef: input.instanceRef || getInstanceRef(origin)
      };
      const event = normalizeEvent2(effectiveInput, resolveTraceId(effectiveInput), origin);
      applyPhaseDuration(event);
      updateTraceMaps(event);
      if (!shouldRecordEvent(level, effectiveInput) && !shouldRecordStartTrace(effectiveInput)) return;
      events.push(event);
      const report = updateReport(event);
      divebellAdapter?.syncReport(report, {
        origin,
        instanceRef: event.instanceRef
      });
      emitStartConsoleHint(event, report);
      emitConsoleHint(event, report, input.error);
      if (shouldNotifyCollector()) notifyCollector(event, report);
      if (shouldNotifyDevtools()) notifyDevtools(event, report);
      notifyRawError(effectiveInput.error, event, report, origin);
      notifyEvent(event, report, origin);
      notifyReport(report, origin);
      return event;
    };
    const markComponentLoadedFor = (markOptions = {}, origin) => {
      if (options.enabled === false || !runtimeObservabilityEnabled) return;
      const instanceRef = getInstanceRef(origin);
      return recordEvent({
        traceId: markOptions.traceId || reportManager.getTraceIdForRequest(instanceRef, sanitizeRequestId(markOptions.requestId)) || reportManager.getLatestTraceId(instanceRef) || createTraceId({
          phase: "component",
          status: "success",
          requestId: markOptions.requestId
        }),
        instanceRef,
        phase: "component",
        status: "success",
        requestId: markOptions.requestId,
        componentName: markOptions.componentName,
        metadata: markOptions.metadata,
        eventName: COMPONENT_BUSINESS_LOADED_EVENT,
        message: COMPONENT_BUSINESS_LOADED_EVENT,
        source: "business"
      }, origin);
    };
    const markComponentLoaded = (markOptions = {}) => markComponentLoadedFor(markOptions, lastRuntimeOrigin);
    const getReactForOrigin = async (origin) => {
      const previousSuppressRuntimeEvents = suppressRuntimeEvents;
      suppressRuntimeEvents = true;
      try {
        let reactFactory;
        try {
          reactFactory = origin.loadShareSync?.("react");
        } catch {
          reactFactory = void 0;
        }
        if (typeof reactFactory !== "function") reactFactory = await origin.loadShare?.("react");
        if (typeof reactFactory !== "function") return;
        return resolveReactLike(reactFactory());
      } catch {
        return;
      } finally {
        suppressRuntimeEvents = previousSuppressRuntimeEvents;
      }
    };
    const getReactWrapPolicy = (loadArgs) => {
      if (options.react?.enabled === false || options.react?.injectLoadedCallback !== true) return;
      const remoteIds = options.react.remoteIds || [];
      if (!remoteIds.length) return { allowAnonymousComponent: false };
      const normalizeRemoteId = (value) => value.replace(/\/\.\//g, "/").replace(/^\.\//, "");
      const expectedRemoteIds = new Set(remoteIds.map(normalizeRemoteId));
      const candidates = /* @__PURE__ */ new Set();
      const addCandidate = (value) => {
        if (!value) return;
        candidates.add(value);
        candidates.add(normalizeRemoteId(value));
      };
      const exposeValues = [loadArgs.expose];
      if (loadArgs.expose?.startsWith("./")) exposeValues.push(loadArgs.expose.slice(2));
      const remoteNames = [
        loadArgs.pkgNameOrAlias,
        loadArgs.remote?.alias,
        loadArgs.remote?.name
      ];
      addCandidate(loadArgs.id);
      addCandidate(loadArgs.expose);
      remoteNames.forEach((remoteName) => {
        exposeValues.forEach((expose) => {
          addCandidate(remoteName && expose ? `${remoteName}/${expose}` : "");
        });
      });
      return Array.from(candidates).some((candidate) => expectedRemoteIds.has(candidate)) ? { allowAnonymousComponent: true } : void 0;
    };
    const createReactComponentWrapper = (component, loadArgs, wrapPolicy, react) => {
      const target = resolveReactComponentTarget(component, options.react?.defaultExportMode || (wrapPolicy.allowAnonymousComponent ? "component" : "preserve"), wrapPolicy.allowAnonymousComponent);
      if (!target) return;
      const componentName = getReactComponentName(target.component, loadArgs.expose || loadArgs.id);
      const originalComponent = target.component;
      const ObservedRemoteComponent = (props) => {
        const incomingProps = isRecord(props) ? props : {};
        const originalLoadedCallback = getObjectValue(incomingProps, ON_MF_REMOTE_LOADED_PROP);
        const onMFRemoteLoaded = (loadedOptions = {}) => {
          markComponentLoadedFor({
            requestId: loadArgs.id,
            componentName: loadedOptions.componentName || componentName,
            metadata: loadedOptions.metadata
          }, loadArgs.origin);
          if (typeof originalLoadedCallback === "function") originalLoadedCallback(loadedOptions);
        };
        const nextProps = {
          ...incomingProps,
          [ON_MF_REMOTE_LOADED_PROP]: onMFRemoteLoaded
        };
        if (react) return react.createElement(originalComponent, nextProps);
        return originalComponent(nextProps);
      };
      ObservedRemoteComponent.displayName = `ObservedRemote(${componentName})`;
      copyComponentStatics(ObservedRemoteComponent, originalComponent);
      return target.createResult(ObservedRemoteComponent);
    };
    const wrapReactComponent = async (component, loadArgs) => {
      const wrapPolicy = getReactWrapPolicy(loadArgs);
      if (!wrapPolicy) return;
      return createReactComponentWrapper(component, loadArgs, wrapPolicy, await getReactForOrigin(loadArgs.origin));
    };
    const wrapReactComponentFactory = async (factory, loadArgs) => {
      const wrapPolicy = getReactWrapPolicy(loadArgs);
      if (!wrapPolicy || typeof factory !== "function") return;
      const react = await getReactForOrigin(loadArgs.origin);
      const originalFactory = factory;
      return (...factoryArgs) => {
        const moduleOrPromise = originalFactory(...factoryArgs);
        if (moduleOrPromise && typeof moduleOrPromise.then === "function") return moduleOrPromise.then((module) => {
          return createReactComponentWrapper(module, loadArgs, wrapPolicy, react) || module;
        });
        return createReactComponentWrapper(moduleOrPromise, loadArgs, wrapPolicy, react) || moduleOrPromise;
      };
    };
    const resolveBridgeHookArgs = (args, signal, origin) => {
      const hookArgs = args;
      if (typeof hookArgs.operationId === "string" && typeof hookArgs.bridgeId === "string") return args;
      const context = isRecord(hookArgs.context) ? hookArgs.context : hookArgs;
      if (!context || !context.side || !context.framework || !context.operation) return;
      const operationKey = context;
      const target = typeof context.target === "object" && context.target !== null ? context.target : void 0;
      const fallbackKey = [
        getInstanceRef(origin) || "",
        context.side,
        context.framework,
        context.moduleName || ""
      ].join("\0");
      let bridgeId = target ? bridgeIdsByTarget.get(target) : bridgeIdsByFallback.get(fallbackKey);
      if (!bridgeId) {
        bridgeCounter += 1;
        bridgeId = `bridge-${bridgeCounter}`;
      }
      if (target) bridgeIdsByTarget.set(target, bridgeId);
      bridgeIdsByFallback.set(fallbackKey, bridgeId);
      const operationLookupKey = [
        getInstanceRef(origin) || "",
        bridgeId,
        context.side,
        context.operation
      ].join("\0");
      let operation = bridgeOperations.get(operationKey) || (signal === "start" ? void 0 : latestBridgeOperations.get(operationLookupKey));
      if (!operation || signal === "start") {
        bridgeOperationCounter += 1;
        operation = {
          operationId: `bridge-op-${bridgeOperationCounter}`,
          bridgeId
        };
        bridgeOperations.set(operationKey, operation);
        latestBridgeOperations.set(operationLookupKey, operation);
      }
      const error = signal === "result" ? hookArgs.error : void 0;
      const result = signal === "result" ? hookArgs.result : void 0;
      const isSkippedNavigation = context.operation === "route-sync" && isRecord(result) && typeof result.type === "number" && isRecord(result.to) && isRecord(result.from);
      const outcome = signal !== "result" ? void 0 : error !== void 0 ? "error" : context.operation === "destroy" && result === false || isSkippedNavigation ? "skipped" : "success";
      return {
        operationId: operation.operationId,
        bridgeId: operation.bridgeId,
        side: context.side,
        framework: context.framework,
        operation: context.operation,
        moduleName: context.moduleName,
        route: context.route,
        reason: context.reason,
        outcome,
        error
      };
    };
    const completeBridgeContext = (rawContext, args) => {
      const context = bridgeContexts.get(rawContext) || { ...rawContext };
      const target = args.dom;
      const moduleName = args.moduleName || args.name;
      if (!context.target && typeof target === "object" && target !== null) context.target = target;
      if (!context.moduleName && typeof moduleName === "string") context.moduleName = moduleName;
      bridgeContexts.set(rawContext, context);
      return context;
    };
    const recordBridgeSignal = (args, signal) => {
      const origin = args.origin || lastRuntimeOrigin;
      if (!origin || !prepareRuntimeOrigin(origin)) return;
      const bridgeArgs = resolveBridgeHookArgs(args, signal, origin);
      if (!bridgeArgs) return;
      const timingKey = [
        getInstanceRef(origin) || "",
        bridgeArgs.operationId,
        bridgeArgs.side,
        bridgeArgs.operation
      ].join("\0");
      const observedAt = Math.max(Date.now(), bridgeObservedAt + 1);
      bridgeObservedAt = observedAt;
      const legacyStartedAt = bridgeArgs.startedAt;
      const legacyEndedAt = bridgeArgs.endedAt;
      const startedAt = signal === "start" ? typeof legacyStartedAt === "number" && Number.isFinite(legacyStartedAt) ? legacyStartedAt : observedAt : bridgeStartTimes.get(timingKey) || (typeof legacyStartedAt === "number" && Number.isFinite(legacyStartedAt) ? legacyStartedAt : observedAt);
      if (signal === "start") bridgeStartTimes.set(timingKey, startedAt);
      const endedAt = signal === "result" ? typeof legacyEndedAt === "number" && Number.isFinite(legacyEndedAt) ? legacyEndedAt : observedAt : void 0;
      const bridge = normalizeBridgeInfo(bridgeArgs, {
        startedAt,
        endedAt,
        duration: endedAt === void 0 ? void 0 : Math.max(0, endedAt - startedAt)
      });
      if (!bridge) return;
      if (signal === "result") bridgeStartTimes.delete(timingKey);
      updateBridgeState(origin, bridge, signal);
      const remote = bridge.remote ? { name: bridge.remote } : void 0;
      const status = signal === "start" ? "start" : bridge.outcome === "error" ? "error" : bridge.outcome === "skipped" ? "complete" : "success";
      const phase = bridge.operation === "destroy" ? "bridge-destroy" : bridge.operation === "route-sync" ? "bridge-route" : "bridge-render";
      const operationLabel = bridge.operation === "update" ? "update" : bridge.operation;
      const message = signal === "start" ? `bridge:${operationLabel}-start` : `bridge:${operationLabel}-${bridge.outcome || "success"}`;
      const instanceRef = getInstanceRef(origin);
      if (signal === "start" && bridge.side === "consumer" && bridge.operation === "render" && instanceRef) {
        const providerKey = `${instanceRef}\0${bridge.bridgeId}`;
        if (!reportedBridgeProviderKeys.has(providerKey)) {
          reportedBridgeProviderKeys.add(providerKey);
          recordEvent({
            phase: "bridge-provider",
            status: "success",
            remote,
            expose: bridge.expose,
            bridge,
            lifecycle: "beforeBridgeRender",
            message: "bridge:provider-acquired",
            source: "runtime"
          }, origin);
        }
      }
      recordEvent({
        phase,
        status,
        remote,
        expose: bridge.expose,
        bridge,
        duration: bridge.duration,
        lifecycle: signal === "start" ? bridge.operation === "destroy" ? "beforeBridgeDestroy" : "beforeBridgeRender" : bridge.operation === "destroy" ? "afterBridgeDestroy" : bridge.operation === "route-sync" ? "afterBridgeRouteSync" : "afterBridgeRender",
        message,
        error: bridge.outcome === "error" ? bridge.error?.message : void 0,
        errorContext: bridge.outcome === "error" ? {
          operationId: bridge.operationId,
          bridgeId: bridge.bridgeId,
          side: bridge.side,
          framework: bridge.framework,
          errorName: bridge.error?.name
        } : void 0,
        source: "runtime"
      }, origin);
    };
    const recordBridgeResult = (args) => {
      const hookArgs = args;
      const result = hookArgs.result;
      if (hookArgs.error === void 0 && result && typeof result.then === "function") {
        Promise.resolve(result).then((value) => recordBridgeSignal({
          ...hookArgs,
          result: value
        }, "result"), (error) => recordBridgeSignal({
          ...hookArgs,
          error
        }, "result"));
        return;
      }
      recordBridgeSignal(args, "result");
    };
    const ensureSharedLoadContext = (args) => {
      const context = args.loadContext || {};
      args.loadContext = context;
      let operationId = sharedOperationIdsByContext.get(context);
      if (!operationId) {
        sharedOperationCounter += 1;
        operationId = `shared-op-${sharedOperationCounter}`;
        sharedOperationIdsByContext.set(context, operationId);
      }
      return {
        ...context,
        operationId
      };
    };
    const getSharedOperationId = (args) => ensureSharedLoadContext(args).operationId;
    const getCompletedSharedSelection = (args) => {
      const context = ensureSharedLoadContext(args);
      let selection = sharedSelections.get(context.operationId);
      const scope = selection?.scope || getSharedScopes(args.shareInfo)[0] || "default";
      const requiredVersion = args.shareInfo?.shareConfig?.requiredVersion;
      if (args.selectedShared && (!selection?.selected || args.selectedShared === args.shareInfo)) {
        const selected = createRuntimeSharedCandidate(scope, args.selectedShared.version || "0", args.selectedShared, requiredVersion);
        selection = {
          ...selection,
          scope,
          requestedVersion: args.shareInfo?.version,
          requiredVersion,
          singleton: args.shareInfo?.shareConfig?.singleton,
          strictVersion: args.shareInfo?.shareConfig?.strictVersion,
          eager: args.shareInfo?.shareConfig?.eager,
          strategy: args.shareInfo?.strategy,
          candidates: getRuntimeSharedCandidates({
            shareScopeMap: args.shareScopeMap,
            scope,
            pkgName: args.pkgName,
            requiredVersion
          }),
          selected,
          reason: "local-fallback",
          failureReason: void 0,
          fallback: true
        };
      }
      if (!selection) {
        const candidates = getRuntimeSharedCandidates({
          shareScopeMap: args.shareScopeMap,
          scope,
          pkgName: args.pkgName,
          requiredVersion
        });
        const failureReason = getSharedErrorReason(args);
        selection = {
          scope,
          requestedVersion: args.shareInfo?.version,
          requiredVersion,
          singleton: args.shareInfo?.shareConfig?.singleton,
          strictVersion: args.shareInfo?.shareConfig?.strictVersion,
          eager: args.shareInfo?.shareConfig?.eager,
          strategy: args.shareInfo?.strategy,
          candidates,
          reason: failureReason || (args.selectedShared ? "exact-match" : "missing-provider"),
          failureReason
        };
      }
      selection = {
        ...selection,
        loadType: args.lifecycle === "loadShareSync" ? "sync" : "async",
        context,
        recovered: args.recovered || selection.recovered
      };
      sharedSelections.delete(context.operationId);
      return selection;
    };
    const recordResourceStart = (resourceArgs) => {
      if (!prepareRuntimeOrigin(resourceArgs.origin)) return;
      const timingKey = [
        getInstanceRef(resourceArgs.origin) || "",
        resourceArgs.id,
        resourceArgs.initiator,
        resourceArgs.resourceType,
        resourceArgs.url
      ].join("\0");
      const startedAt = Date.now();
      const pendingStarts = resourceStartTimes.get(timingKey) || [];
      pendingStarts.push(startedAt);
      resourceStartTimes.set(timingKey, pendingStarts);
      const remote = createRemoteInfo(resourceArgs.remote);
      recordEvent({
        phase: resourceArgs.resourceType === "manifest" || resourceArgs.resourceType === "remoteEntry" ? resourceArgs.resourceType : "preload",
        status: "start",
        requestId: resourceArgs.id,
        remote,
        expose: resourceArgs.expose,
        url: resourceArgs.url,
        timestamp: startedAt,
        lifecycle: resourceArgs.lifecycle,
        message: `resource:${resourceArgs.resourceType}:load-start`,
        resource: {
          type: resourceArgs.resourceType,
          initiator: resourceArgs.initiator,
          url: resourceArgs.url,
          startedAt
        }
      }, resourceArgs.origin);
    };
    const recordResourceResult = (resourceArgs) => {
      if (!prepareRuntimeOrigin(resourceArgs.origin)) return;
      const timingKey = [
        getInstanceRef(resourceArgs.origin) || "",
        resourceArgs.id,
        resourceArgs.initiator,
        resourceArgs.resourceType,
        resourceArgs.url
      ].join("\0");
      const startedAt = resourceStartTimes.get(timingKey)?.shift() || Date.now();
      const endedAt = Date.now();
      if (resourceStartTimes.get(timingKey)?.length === 0) resourceStartTimes.delete(timingKey);
      const remote = createRemoteInfo(resourceArgs.remote);
      const phase = resourceArgs.resourceType === "manifest" || resourceArgs.resourceType === "remoteEntry" ? resourceArgs.resourceType : "preload";
      const response = resourceArgs.response;
      const httpStatus = resourceArgs.httpStatus ?? (typeof response?.status === "number" ? response.status : void 0);
      let mimeType = resourceArgs.mimeType;
      if (!mimeType && typeof response?.headers?.get === "function") try {
        mimeType = response.headers.get("content-type") || void 0;
      } catch {
      }
      const redirected = resourceArgs.redirected ?? (typeof response?.redirected === "boolean" ? response.redirected : void 0);
      const rawOutcome = resourceArgs.outcome === "success" && typeof httpStatus === "number" && httpStatus >= 400 ? "error" : resourceArgs.outcome;
      const resourceError = resourceArgs.error || (rawOutcome === "error" && typeof httpStatus === "number" ? /* @__PURE__ */ new Error(`Resource request failed with HTTP status ${httpStatus}.`) : void 0);
      const errorType = classifyResourceLoadError({
        ...resourceArgs,
        outcome: rawOutcome,
        httpStatus,
        mimeType,
        redirected,
        error: resourceError
      });
      const outcome = rawOutcome === "error" && errorType === "timeout" ? "timeout" : rawOutcome;
      const isError = outcome === "error" || outcome === "timeout";
      const status = outcome === "recovered" ? "complete" : isError ? "error" : "success";
      const duration = Math.max(0, endedAt - startedAt);
      const resource = {
        type: resourceArgs.resourceType,
        initiator: resourceArgs.initiator,
        outcome,
        url: resourceArgs.url,
        startedAt,
        endedAt,
        duration,
        httpStatus,
        mimeType,
        redirected,
        cacheSource: resourceArgs.cacheSource,
        errorType
      };
      recordEvent({
        phase,
        status,
        requestId: resourceArgs.id,
        remote,
        expose: resourceArgs.expose,
        url: resourceArgs.url,
        timestamp: endedAt,
        duration,
        lifecycle: resourceArgs.lifecycle,
        message: `resource:${resourceArgs.resourceType}:${outcome}`,
        error: isError || outcome === "recovered" ? resourceError : void 0,
        recovered: outcome === "recovered",
        cached: outcome === "cached",
        resource,
        errorContext: isError || outcome === "recovered" ? {
          resourceType: resourceArgs.resourceType,
          initiator: resourceArgs.initiator,
          outcome,
          errorType,
          httpStatus
        } : void 0,
        metadata: clipObservabilityMetadata({
          resourceType: resourceArgs.resourceType,
          initiator: resourceArgs.initiator,
          outcome,
          httpStatus,
          mimeType,
          redirected,
          cacheSource: resourceArgs.cacheSource,
          errorType
        })
      }, resourceArgs.origin);
    };
    const recordSharedRegistration = (registrationArgs, lifecycle) => {
      sharedRegistrationCounter += 1;
      const sharedInfo = createSharedRegistrationInfo(registrationArgs, `shared-register-${sharedRegistrationCounter}`);
      const registration = sharedInfo.registration;
      recordEvent({
        phase: "shared-registration",
        status: "success",
        requestId: registration?.registrationId,
        lifecycle,
        shared: sharedInfo,
        message: `shared:registration-${registration?.action || "unknown"}`,
        metadata: {
          scope: registration?.scope || registrationArgs.scope,
          action: registration?.action || "unknown",
          reason: registration?.reason || "unknown",
          trigger: registration?.trigger || registrationArgs.trigger
        }
      }, registrationArgs.origin);
    };
    const legacyHooks = {
      beforeBridgeRender(args, context) {
        if (context) recordBridgeSignal({
          context: completeBridgeContext(context, args),
          origin: args.origin
        }, "start");
        return returnHookArgs(args);
      },
      afterBridgeRender(args, result) {
        if (result) recordBridgeResult({
          ...result,
          context: completeBridgeContext(result.context, args),
          origin: args.origin
        });
        return returnHookArgs(args);
      },
      beforeBridgeDestroy(args, context) {
        if (context) recordBridgeSignal({
          context: completeBridgeContext(context, args),
          origin: args.origin
        }, "start");
        return returnHookArgs(args);
      },
      afterBridgeDestroy(args, result) {
        if (result) recordBridgeResult({
          ...result,
          context: completeBridgeContext(result.context, args),
          origin: args.origin
        });
        return returnHookArgs(args);
      },
      afterBridgeRouteSync(args) {
        recordBridgeResult(args);
      },
      beforeLoadManifest(args) {
        const manifestArgs = args;
        recordResourceStart({
          origin: manifestArgs.origin,
          id: manifestArgs.resourceOptions?.id || manifestArgs.moduleInfo.name || manifestArgs.manifestUrl,
          initiator: manifestArgs.resourceOptions?.initiator || "loadRemote",
          resourceType: "manifest",
          url: manifestArgs.manifestUrl,
          remote: manifestArgs.moduleInfo,
          expose: manifestArgs.resourceOptions?.expose,
          lifecycle: "beforeLoadManifest"
        });
      },
      afterLoadManifest(args) {
        const manifestArgs = args;
        const outcome = manifestArgs.cached ? "cached" : manifestArgs.error ? manifestArgs.recovered ? "recovered" : "error" : "success";
        loadingManifestUrls.delete(manifestArgs.manifestUrl);
        if (outcome !== "error") seenManifestUrls.add(manifestArgs.manifestUrl);
        recordResourceResult({
          origin: manifestArgs.origin,
          id: manifestArgs.resourceOptions?.id || manifestArgs.moduleInfo.name || manifestArgs.manifestUrl,
          initiator: manifestArgs.resourceOptions?.initiator || "loadRemote",
          resourceType: "manifest",
          url: manifestArgs.manifestUrl,
          remote: manifestArgs.moduleInfo,
          expose: manifestArgs.resourceOptions?.expose,
          outcome,
          response: manifestArgs.response,
          cacheSource: manifestArgs.cached ? "mf-memory" : void 0,
          error: manifestArgs.error,
          lifecycle: "afterLoadManifest"
        });
      },
      beforeRequest(args) {
        const requestArgs = args;
        if (!prepareRuntimeOrigin(requestArgs.origin)) return returnHookArgs(args);
        const remote = resolveRemoteFromRequestId(requestArgs.id, requestArgs.options);
        recordEvent({
          phase: "loadRemote",
          status: "start",
          requestId: requestArgs.id,
          remote,
          lifecycle: "beforeRequest",
          message: "remote:load-start"
        }, requestArgs.origin);
        return returnHookArgs(args);
      },
      afterMatchRemote(args) {
        const matchArgs = args;
        if (!prepareRuntimeOrigin(matchArgs.origin)) return;
        const remote = createRemoteInfo(matchArgs.remoteInfo || matchArgs.remote);
        const hostRemotes = getHostRemotesSummary(matchArgs.options);
        recordEvent({
          phase: "matchRemote",
          status: matchArgs.error ? "error" : "success",
          requestId: matchArgs.id,
          lifecycle: "afterMatchRemote",
          expose: matchArgs.expose,
          remote,
          message: matchArgs.error ? "remote:match-failed" : "remote:matched",
          error: matchArgs.error,
          errorContext: hostRemotes ? { hostRemotes } : void 0
        }, matchArgs.origin);
      },
      beforeLoadRemoteSnapshot(args) {
        prepareRuntimeOrigin(args.origin);
      },
      loadSnapshot(args) {
        if (!isEnabled()) return returnHookArgs(args);
        const snapshotArgs = args;
        const supportsManifestResult = supportsManifestResultLifecycle(snapshotArgs.origin);
        const moduleRemote = createRemoteInfo(snapshotArgs.moduleInfo);
        const snapshotRemoteEntry = snapshotArgs.remoteSnapshot?.remoteEntry || snapshotArgs.remoteSnapshot?.entry;
        const manifestUrl = isManifestUrl(moduleRemote?.entry) ? moduleRemote?.entry : isManifestUrl(snapshotRemoteEntry) ? snapshotRemoteEntry : void 0;
        if (!manifestUrl) return returnHookArgs(args);
        const remote = createRemoteInfo({
          name: moduleRemote?.name || sanitizeText(snapshotArgs.remoteSnapshot?.name, 120),
          alias: moduleRemote?.alias,
          entry: manifestUrl,
          entryGlobalName: moduleRemote?.entryGlobalName || sanitizeText(snapshotArgs.remoteSnapshot?.entryGlobalName, 120),
          type: moduleRemote?.type || sanitizeText(snapshotArgs.remoteSnapshot?.type, 80)
        });
        if (seenManifestUrls.has(manifestUrl)) {
          if (supportsManifestResult) return returnHookArgs(args);
          recordEvent({
            phase: "manifest",
            status: "success",
            requestId: manifestUrl,
            remote,
            url: manifestUrl,
            lifecycle: "loadSnapshot",
            message: "manifest:cached",
            cached: true
          }, lastRuntimeOrigin);
          return returnHookArgs(args);
        }
        if (loadingManifestUrls.has(manifestUrl)) return returnHookArgs(args);
        loadingManifestUrls.add(manifestUrl);
        if (supportsManifestResult) return returnHookArgs(args);
        recordEvent({
          phase: "manifest",
          status: "start",
          requestId: manifestUrl,
          remote,
          url: manifestUrl,
          lifecycle: "loadSnapshot",
          message: "manifest:load-start"
        }, lastRuntimeOrigin);
        return returnHookArgs(args);
      },
      loadRemoteSnapshot(args) {
        if (options.enabled === false) return returnHookArgs(args);
        const snapshotArgs = args;
        if (supportsManifestResultLifecycle(lastRuntimeOrigin)) return returnHookArgs(args);
        if (snapshotArgs.from !== "manifest") return returnHookArgs(args);
        const manifestUrl = sanitizeUrl(snapshotArgs.manifestUrl) || sanitizeUrl(snapshotArgs.moduleInfo?.entry);
        recordEvent({
          phase: "manifest",
          status: "success",
          requestId: manifestUrl,
          remote: createRemoteInfo({
            ...snapshotArgs.moduleInfo,
            entry: manifestUrl || snapshotArgs.moduleInfo?.entry
          }),
          url: manifestUrl,
          lifecycle: "loadRemoteSnapshot",
          message: "manifest:resolved",
          cached: Boolean(manifestUrl && seenManifestUrls.has(manifestUrl))
        }, lastRuntimeOrigin);
        if (manifestUrl) {
          loadingManifestUrls.delete(manifestUrl);
          seenManifestUrls.add(manifestUrl);
        }
        return returnHookArgs(args);
      },
      afterResolve(args) {
        const resolveArgs = args;
        if (!prepareRuntimeOrigin(resolveArgs.origin)) return returnHookArgs(args);
        if (!isManifestUrl(createRemoteInfo(resolveArgs.remoteInfo || resolveArgs.remote)?.entry)) return returnHookArgs(args);
        return returnHookArgs(args);
      },
      async onLoad(args) {
        const loadArgs = args;
        if (!prepareRuntimeOrigin(loadArgs.origin)) return;
        const wrappedComponent = typeof loadArgs.exposeModuleFactory === "function" ? await wrapReactComponentFactory(loadArgs.exposeModuleFactory, loadArgs) : await wrapReactComponent(loadArgs.exposeModule, loadArgs);
        const remote = createRemoteInfo(loadArgs.remote);
        recordEvent({
          phase: "loadRemote",
          status: "success",
          requestId: loadArgs.id,
          lifecycle: "onLoad",
          expose: loadArgs.expose,
          remote,
          message: "remote:loaded",
          loadedBefore: shouldCollectLoadedBefore() ? collectLoadedBeforeInfo(remote, loadArgs.expose, loadArgs.origin) : void 0
        }, loadArgs.origin);
        if (wrappedComponent) return wrappedComponent;
      },
      errorLoadRemote(args) {
        const errorArgs = args;
        if (!prepareRuntimeOrigin(errorArgs.origin) || errorArgs.lifecycle !== "onLoad" && errorArgs.lifecycle !== "beforeRequest" && errorArgs.lifecycle !== "afterResolve") return;
        const isManifestError = errorArgs.lifecycle === "afterResolve";
        if (isManifestError && errorArgs.id) loadingManifestUrls.delete(errorArgs.id);
        const remote = createRemoteInfo(errorArgs.remote);
        recordEvent({
          phase: isManifestError ? "manifest" : "loadRemote",
          status: "error",
          requestId: errorArgs.id,
          lifecycle: errorArgs.lifecycle,
          expose: errorArgs.expose,
          remote,
          url: isManifestError ? errorArgs.id : void 0,
          message: isManifestError ? "manifest:failed" : errorArgs.lifecycle ? `remote:${errorArgs.lifecycle}:failed` : "remote:failed",
          error: errorArgs.error,
          loadedBefore: collectLoadedBeforeInfo(remote, errorArgs.expose, errorArgs.origin)
        }, errorArgs.origin);
      },
      afterLoadRemote(args) {
        const loadArgs = args;
        if (!prepareRuntimeOrigin(loadArgs.origin)) return;
        const remote = createRemoteInfo(loadArgs.remote);
        recordEvent({
          phase: "loadRemote",
          status: "complete",
          requestId: loadArgs.id,
          lifecycle: "afterLoadRemote",
          expose: loadArgs.expose,
          remote,
          message: loadArgs.recovered ? "remote:load-recovered" : loadArgs.error ? "remote:load-failed" : "remote:load-complete",
          error: loadArgs.error,
          recovered: loadArgs.recovered,
          loadedBefore: shouldCollectLoadedBefore(loadArgs.error) ? collectLoadedBeforeInfo(remote, loadArgs.expose, loadArgs.origin) : void 0
        }, loadArgs.origin);
      },
      loadEntry(args) {
        const entryArgs = args;
        if (shouldSkipRuntimeHook(entryArgs.origin) || !prepareRuntimeOrigin(entryArgs.origin)) return;
        const remote = createRemoteInfo(entryArgs.remoteInfo);
        const resourceContext = entryArgs.resourceContext;
        recordResourceStart({
          origin: entryArgs.origin,
          id: resourceContext?.id || remote?.name || "remoteEntry",
          initiator: resourceContext?.initiator || "loadRemote",
          resourceType: "remoteEntry",
          url: resourceContext?.url || remote?.entry || "",
          remote,
          expose: resourceContext?.expose,
          lifecycle: "loadEntry"
        });
      },
      afterLoadEntry(args) {
        const entryArgs = args;
        if (shouldSkipRuntimeHook(entryArgs.origin) || !prepareRuntimeOrigin(entryArgs.origin)) return;
        const remote = createRemoteInfo(entryArgs.remoteInfo);
        const remoteEntryKey = getRemoteEntryKey(sanitizeRemote(remote));
        const cached = entryArgs.cached === true || Boolean(remoteEntryKey && seenRemoteEntryKeys.has(remoteEntryKey));
        const resourceContext = entryArgs.resourceContext;
        const outcome = entryArgs.recovered ? "recovered" : entryArgs.error ? "error" : cached ? "cached" : "success";
        recordResourceResult({
          origin: entryArgs.origin,
          id: resourceContext?.id || remote?.name || "remoteEntry",
          initiator: resourceContext?.initiator || "loadRemote",
          resourceType: "remoteEntry",
          url: resourceContext?.url || remote?.entry || "",
          remote,
          expose: resourceContext?.expose,
          outcome,
          cacheSource: outcome === "cached" ? "mf-memory" : void 0,
          error: entryArgs.error,
          lifecycle: "afterLoadEntry"
        });
        if (!entryArgs.error && remoteEntryKey) seenRemoteEntryKeys.add(remoteEntryKey);
      },
      beforeInitRemote(args) {
        const initArgs = args;
        if (shouldSkipRuntimeHook(initArgs.origin) || !prepareRuntimeOrigin(initArgs.origin)) return;
        const remote = createRemoteInfo(initArgs.remoteInfo);
        recordEvent({
          phase: "remoteEntryInit",
          status: "start",
          requestId: initArgs.id || remote?.name,
          remote,
          lifecycle: "beforeInitRemote",
          message: "remoteEntry:init-start"
        }, initArgs.origin);
      },
      afterInitRemote(args) {
        const initArgs = args;
        if (shouldSkipRuntimeHook(initArgs.origin) || !prepareRuntimeOrigin(initArgs.origin)) return;
        const remote = createRemoteInfo(initArgs.remoteInfo);
        recordEvent({
          phase: "remoteEntryInit",
          status: initArgs.error ? "error" : "success",
          requestId: initArgs.id || remote?.name,
          remote,
          lifecycle: "afterInitRemote",
          message: initArgs.error ? "remoteEntry:init-failed" : initArgs.cached ? "remoteEntry:init-reused" : "remoteEntry:initialized",
          error: initArgs.error,
          cached: initArgs.cached
        }, initArgs.origin);
      },
      beforeGetExpose(args) {
        const exposeArgs = args;
        if (shouldSkipRuntimeHook(exposeArgs.origin) || !prepareRuntimeOrigin(exposeArgs.origin)) return;
        recordEvent({
          phase: "expose",
          status: "start",
          requestId: exposeArgs.id,
          expose: exposeArgs.expose,
          remote: createRemoteInfo(exposeArgs.moduleInfo),
          lifecycle: "beforeGetExpose",
          message: "expose:get-start"
        }, exposeArgs.origin);
      },
      afterGetExpose(args) {
        const exposeArgs = args;
        if (shouldSkipRuntimeHook(exposeArgs.origin) || !prepareRuntimeOrigin(exposeArgs.origin)) return;
        const remote = createRemoteInfo(exposeArgs.moduleInfo);
        recordEvent({
          phase: "expose",
          status: exposeArgs.error ? "error" : "success",
          requestId: exposeArgs.id,
          expose: exposeArgs.expose,
          remote,
          lifecycle: "afterGetExpose",
          message: exposeArgs.error ? "expose:get-failed" : "expose:resolved",
          error: exposeArgs.error,
          loadedBefore: shouldCollectLoadedBefore(exposeArgs.error) ? collectLoadedBeforeInfo(remote, exposeArgs.expose, exposeArgs.origin) : void 0
        }, exposeArgs.origin);
      },
      beforeExecuteFactory(args) {
        const factoryArgs = args;
        if (shouldSkipRuntimeHook(factoryArgs.origin) || !prepareRuntimeOrigin(factoryArgs.origin)) return;
        recordEvent({
          phase: "moduleFactory",
          status: "start",
          requestId: factoryArgs.id,
          expose: factoryArgs.expose,
          remote: createRemoteInfo(factoryArgs.moduleInfo),
          lifecycle: "beforeExecuteFactory",
          message: "moduleFactory:execute-start"
        }, factoryArgs.origin);
      },
      afterExecuteFactory(args) {
        const factoryArgs = args;
        if (shouldSkipRuntimeHook(factoryArgs.origin) || !prepareRuntimeOrigin(factoryArgs.origin)) return;
        const remote = createRemoteInfo(factoryArgs.moduleInfo);
        recordEvent({
          phase: "moduleFactory",
          status: factoryArgs.error ? "error" : "success",
          requestId: factoryArgs.id,
          expose: factoryArgs.expose,
          remote,
          lifecycle: "afterExecuteFactory",
          message: factoryArgs.error ? "moduleFactory:execute-failed" : "moduleFactory:executed",
          error: factoryArgs.error,
          loadedBefore: shouldCollectLoadedBefore(factoryArgs.error) ? collectLoadedBeforeInfo(remote, factoryArgs.expose, factoryArgs.origin) : void 0
        }, factoryArgs.origin);
      },
      resolveShare(args) {
        const resolveArgs = args;
        if (shouldGuardSharedHooksByRuntimeVersion && !supportsRuntimeHookObservability(resolveArgs.origin) || !resolveArgs.origin || !prepareRuntimeOrigin(resolveArgs.origin)) return args;
        const context = ensureSharedLoadContext(resolveArgs);
        const resolver = resolveArgs.resolver;
        resolveArgs.resolver = () => {
          try {
            const result = resolver();
            sharedSelections.set(context.operationId, createRuntimeSharedSelection(resolveArgs, result?.shared));
            return result;
          } catch (error) {
            sharedSelections.set(context.operationId, createRuntimeSharedSelection(resolveArgs, void 0, error));
            throw error;
          }
        };
        return resolveArgs;
      },
      beforeRegisterShare(args) {
        if (shouldGuardSharedHooksByRuntimeVersion && !supportsRuntimeHookObservability(args.origin)) return returnHookArgs(args);
        if (!prepareRuntimeOrigin(args.origin)) return returnHookArgs(args);
        const shareScopeMap = getOriginShareScopeMap(args.origin);
        const hostName = sanitizeText(args.origin.options?.name, 120) || sanitizeText(args.origin.name, 120);
        getSharedScopes(args.shared).forEach((scope) => {
          const conflict = createSharedSingletonConflict({
            pkgName: args.pkgName,
            shared: args.shared,
            scope,
            shareScopeMap
          });
          if (!conflict) return;
          const conflictKey = getSharedConflictKey({
            hostName,
            pkgName: args.pkgName,
            conflict
          });
          if (reportedSharedConflictKeys.has(conflictKey)) return;
          reportedSharedConflictKeys.add(conflictKey);
          recordEvent({
            phase: "shared-conflict",
            status: "complete",
            requestId: `shared:${args.pkgName}`,
            lifecycle: "beforeRegisterShare",
            shared: createSharedConflictInfo({
              pkgName: args.pkgName,
              shared: args.shared,
              conflict
            }),
            message: `shared:${SHARED_SINGLETON_MULTIPLE_VERSIONS_REASON}`,
            metadata: {
              scope,
              currentVersion: conflict.currentVersion || "",
              versions: conflict.versions.join(","),
              existingVersions: conflict.existingVersions.map((item) => item.version).join(",")
            }
          }, args.origin);
        });
        return returnHookArgs(args);
      },
      initContainerShareScopeMap(args) {
        const scopeArgs = args;
        if (shouldGuardSharedHooksByRuntimeVersion && !supportsRuntimeHookObservability(scopeArgs.origin)) return returnHookArgs(args);
        if (!prepareRuntimeOrigin(scopeArgs.origin)) return returnHookArgs(args);
        const shareScopeMap = getOriginShareScopeMap(scopeArgs.origin);
        Object.entries(scopeArgs.shareScope).forEach(([pkgName, versions]) => {
          getRuntimeSharedVersionEntries(versions).forEach(([, shared]) => {
            recordSharedRegistration({
              pkgName,
              scope: scopeArgs.scopeName,
              shared,
              registeredShared: shared,
              shareScopeMap,
              trigger: "container-init",
              origin: scopeArgs.origin
            }, "initContainerShareScopeMap");
          });
        });
        return returnHookArgs(args);
      },
      afterRegisterShare(args) {
        const registrationArgs = args;
        if (shouldGuardSharedHooksByRuntimeVersion && !supportsRuntimeHookObservability(registrationArgs.origin)) return returnHookArgs(args);
        if (!prepareRuntimeOrigin(registrationArgs.origin)) return returnHookArgs(args);
        recordSharedRegistration(registrationArgs, "afterRegisterShare");
        return returnHookArgs(args);
      },
      beforeLoadShare(args) {
        if (shouldGuardSharedHooksByRuntimeVersion && !supportsRuntimeHookObservability(args.origin)) return returnHookArgs(args);
        if (!prepareRuntimeOrigin(args.origin)) return returnHookArgs(args);
        ensureSharedLoadContext(args);
        recordEvent({
          phase: "shared",
          status: "start",
          requestId: getSharedOperationId(args),
          lifecycle: "loadShare",
          shared: createSharedInfo(args),
          message: "shared:load-start"
        }, args.origin);
        return returnHookArgs(args);
      },
      afterLoadShare(args) {
        if (shouldGuardSharedHooksByRuntimeVersion && !supportsRuntimeHookObservability(args.origin)) return returnHookArgs(args);
        if (!prepareRuntimeOrigin(args.origin)) return returnHookArgs(args);
        const selection = getCompletedSharedSelection(args);
        recordEvent({
          phase: "shared",
          status: "success",
          requestId: getSharedOperationId(args),
          lifecycle: args.lifecycle,
          shared: createSharedInfo(args, void 0, selection),
          message: args.lifecycle === "loadShareSync" ? "shared:resolved-sync" : "shared:resolved"
        }, args.origin);
        return returnHookArgs(args);
      },
      errorLoadShare(args) {
        if (shouldGuardSharedHooksByRuntimeVersion && !supportsRuntimeHookObservability(args.origin)) return returnHookArgs(args);
        if (!prepareRuntimeOrigin(args.origin)) return returnHookArgs(args);
        const handledCustomShareMiss = args.recovered === true && !args.error;
        const reason = handledCustomShareMiss ? "custom-share-info-unmatched" : getSharedErrorReason(args);
        const selection = getCompletedSharedSelection(args);
        recordEvent({
          phase: "shared",
          status: handledCustomShareMiss ? "complete" : "error",
          requestId: getSharedOperationId(args),
          lifecycle: args.lifecycle,
          shared: createSharedInfo(args, reason, selection),
          message: reason ? `shared:${reason}` : void 0,
          error: handledCustomShareMiss ? void 0 : args.error,
          recovered: args.recovered
        }, args.origin);
        return returnHookArgs(args);
      }
    };
    if (!shouldDisablePreloadHooks) {
      legacyHooks.generatePreloadAssets = async (args) => {
        const preloadArgs = args;
        if (!prepareRuntimeOrigin(preloadArgs.origin)) return /* @__PURE__ */ continuePreloadAssetsGeneration();
        const remote = createRemoteInfo(preloadArgs.remoteInfo || preloadArgs.remote);
        const preloadConfig = preloadArgs.preloadOptions?.preloadConfig;
        recordEvent({
          phase: "preload",
          status: "start",
          requestId: remote?.name || sanitizeText(preloadConfig?.nameOrAlias, 160),
          remote,
          lifecycle: "generatePreloadAssets",
          message: "preload:assets-ready",
          metadata: clipObservabilityMetadata({
            nameOrAlias: preloadConfig?.nameOrAlias,
            exposes: preloadConfig?.exposes?.join(","),
            resourceCategory: preloadConfig?.resourceCategory,
            share: preloadConfig?.share,
            depsRemote: Array.isArray(preloadConfig?.depsRemote) ? "custom" : preloadConfig?.depsRemote
          })
        }, preloadArgs.origin);
        return /* @__PURE__ */ continuePreloadAssetsGeneration();
      };
      legacyHooks.afterPreloadRemote = (args) => {
        const preloadArgs = args;
        if (!prepareRuntimeOrigin(preloadArgs.origin)) return;
        const results = preloadArgs.results || [];
        if (results.length === 0 && preloadArgs.error) {
          recordEvent({
            phase: "preload",
            status: "error",
            requestId: "preloadRemote",
            lifecycle: "afterPreloadRemote",
            message: "preload:failed",
            error: preloadArgs.error
          }, preloadArgs.origin);
          return;
        }
        results.forEach((preloadResult) => {
          const remote = createRemoteInfo(preloadResult.remoteInfo || preloadResult.remote);
          const requestId = sanitizeRequestId(preloadResult.id) || remote?.name || sanitizeText(preloadResult.preloadConfig?.nameOrAlias, 160);
          preloadResult.results?.forEach((assetResult) => {
            const isError = assetResult.status === "error" || assetResult.status === "timeout";
            recordEvent({
              phase: "preload",
              status: isError ? "error" : "success",
              requestId,
              remote,
              url: assetResult.url,
              cached: assetResult.status === "cached",
              lifecycle: "afterPreloadRemote",
              message: `preload:${assetResult.resourceType || "resource"}:${assetResult.status || "complete"}`,
              error: isError ? assetResult.error : void 0,
              errorContext: isError ? {
                resourceType: assetResult.resourceType,
                initiator: assetResult.initiator,
                status: assetResult.status,
                id: assetResult.id
              } : void 0,
              metadata: clipObservabilityMetadata({
                resourceType: assetResult.resourceType,
                initiator: assetResult.initiator,
                status: assetResult.status,
                id: assetResult.id,
                preloadNameOrAlias: preloadResult.preloadConfig?.nameOrAlias
              })
            }, preloadArgs.origin);
          });
        });
      };
    }
    const createRuntimeHooks = (boundInstance) => {
      if (!boundInstance) return legacyHooks;
      const boundHooks = {};
      Object.entries(legacyHooks).forEach(([lifecycle, handler]) => {
        if (typeof handler !== "function") return;
        boundHooks[lifecycle] = (...handlerArgs) => {
          const origin = boundInstance;
          prepareRuntimeOrigin(origin);
          const [firstArg, ...remainingArgs] = handlerArgs;
          return handler(isRecord(firstArg) ? {
            ...firstArg,
            origin
          } : firstArg, ...remainingArgs);
        };
      });
      return boundHooks;
    };
    return {
      plugin: {
        name: pluginName,
        apply(instance) {
          const origin = instance;
          registerRuntimeInstance(origin, getActiveRuntimeInstances().some((item) => item === instance));
          const instanceRef = getInstanceRef(origin);
          if (instanceRef) boundInstanceRefs.add(instanceRef);
          appliedRuntimeVersion = sanitizeText(instance.version, 80) || appliedRuntimeVersion;
          if (shouldAttachInstanceApi) {
            let instanceApi = attachedInstanceApis.get(instance);
            if (!instanceApi) {
              instanceApi = { markComponentLoaded: (markOptions) => markComponentLoadedFor(markOptions, origin) };
              attachedInstanceApis.set(instance, instanceApi);
            }
            instance.markComponentLoaded = instanceApi.markComponentLoaded;
          }
          prepareOutputChannels(origin);
          divebellAdapter?.register();
          return createRuntimeHooks(instance);
        },
        ...legacyHooks
      },
      getEvents() {
        return getEventsSnapshot();
      },
      getTraceIds() {
        return getTraceIdsSnapshot();
      },
      getReports(options2) {
        return getReportsSnapshot(options2);
      },
      findReports(query) {
        return findReportsSnapshot(query);
      },
      getLatestReport() {
        return getLatestReportSnapshot();
      },
      getReport(traceId) {
        return getReportSnapshot(traceId);
      },
      exportReport(traceId) {
        return exportReportSnapshot(traceId);
      },
      getRuntimeState() {
        return getRuntimeStateSnapshot();
      },
      clear() {
        reportManager.clear();
        latestBridgeOperations.clear();
        bridgeStartTimes.clear();
        resourceStartTimes.clear();
        sharedOperationIdsByContext = /* @__PURE__ */ new WeakMap();
        seenManifestUrls.clear();
        seenRemoteEntryKeys.clear();
        reportedBridgeProviderKeys.clear();
        consoleReportedTraceIds.clear();
        consoleReportedStartKeys.clear();
        bridgeObservedAt = 0;
        runtimeObservabilityEnabled = false;
        browserGlobalScope = void 0;
        lastRuntimeOrigin = void 0;
        historyCleared = true;
      },
      markComponentLoaded
    };
  }

  // dist/esm/chrome-devtool.js
  function ChromeObservabilityPlugin(options = {}) {
    return createObservability(options, {
      pluginName: "observability-plugin:chrome-extension",
      fixedBrowserScope: "chrome_extension",
      attachInstanceApi: false,
      guardSharedHooksByRuntimeVersion: true,
      guardRuntimeHooksByRuntimeVersion: true,
      disablePreloadHooks: true,
      returnHookArgs: true,
      forceDevelopmentChannels: true
    }).plugin;
  }
  return __toCommonJS(chrome_devtool_exports);
})();
