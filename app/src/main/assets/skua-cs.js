/* skua-cs.js — executor de scripts C# do Skua (transpilador C# -> JavaScript) + runtime (LINQ, string, Core shim).
 * Suporta o subconjunto de C# usado pelos scripts do Skua: classes, métodos, campos, propriedades, enums,
 * if/for/foreach/while/switch/try, lambdas, LINQ comum, interpolação de string, argumentos nomeados, out var.
 * NÃO suporta: genéricos definidos pelo usuário com restrições, yield, goto, pattern matching avançado, tuplas, unsafe. */
(function () {
  'use strict';
  var W = window;

  // =============================== TOKENIZER ===============================
  var OPS = ['>>>=', '<<=', '>>=', '??=', '...', '..', '=>', '??', '?.', '++', '--', '&&', '||', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '::', '->'];
  function CsError(msg, line) { var e = new Error(msg + (line ? ' (linha ' + line + ')' : '')); e.csError = true; return e; }

  function tokenize(src, directives) {
    var t = [], i = 0, n = src.length, line = 1;
    function push(type, v, extra) { var o = { t: type, v: v, line: line }; if (extra) for (var k in extra) o[k] = extra[k]; t.push(o); }
    function esc(c, s, j) { // retorna [char, novo j]
      var m = { n: '\n', t: '\t', r: '\r', '0': '\0', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"', "'": "'" };
      if (c === 'u') return [String.fromCharCode(parseInt(s.substr(j + 1, 4), 16)), j + 5];
      if (c === 'x') { var h = /^[0-9a-fA-F]{1,4}/.exec(s.substr(j + 1, 4))[0]; return [String.fromCharCode(parseInt(h, 16)), j + 1 + h.length]; }
      return [m[c] !== undefined ? m[c] : c, j + 1];
    }
    while (i < n) {
      var c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\uFEFF') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') {
        var e = src.indexOf('\n', i); if (e < 0) e = n;
        var cm = src.slice(i, e).trim(); if (directives && /^\/\/cs_/.test(cm)) directives.push(cm);
        i = e; continue;
      }
      if (c === '/' && src[i + 1] === '*') { var e2 = src.indexOf('*/', i + 2); if (e2 < 0) e2 = n; for (var q = i; q < e2; q++) if (src[q] === '\n') line++; i = e2 + 2; continue; }
      if (c === '#') { var e3 = src.indexOf('\n', i); i = e3 < 0 ? n : e3; continue; }
      // strings
      var isStrStart = c === '"' || ((c === '$' || c === '@') && (src[i + 1] === '"' || ((src[i + 1] === '$' || src[i + 1] === '@') && src[i + 2] === '"')));
      if (isStrStart) {
        var interp = false, verb = false;
        while (src[i] !== '"') { if (src[i] === '$') interp = true; if (src[i] === '@') verb = true; i++; }
        i++;
        var parts = [], cur = '';
        while (i < n) {
          var ch = src[i];
          if (ch === '"') { if (verb && src[i + 1] === '"') { cur += '"'; i += 2; continue; } i++; break; }
          if (ch === '\n') line++;
          if (!verb && ch === '\\') { var r = esc(src[i + 1], src, i + 1); cur += r[0]; i = r[1]; continue; }
          if (interp && ch === '{') {
            if (src[i + 1] === '{') { cur += '{'; i += 2; continue; }
            var d = 0, j = i + 1, qd = 0, inStr = false;
            for (; j < n; j++) {
              var cj = src[j];
              if (inStr) { if (cj === '\\') j++; else if (cj === '"') inStr = false; continue; }
              if (cj === '"') { inStr = true; continue; }
              if (cj === '(' || cj === '[' || cj === '{') d++;
              else if (cj === ')' || cj === ']') d--;
              else if (cj === '}') { if (d === 0) break; d--; }
            }
            var inner = src.slice(i + 1, j), fmt = null, ter = 0, dd = 0, cut = -1;
            for (var k = 0; k < inner.length; k++) {
              var ck = inner[k];
              if (ck === '(' || ck === '[') dd++; else if (ck === ')' || ck === ']') dd--;
              else if (dd === 0 && ck === '?' && inner[k + 1] !== '?' && inner[k - 1] !== '?' && inner[k + 1] !== '.') ter++;
              else if (dd === 0 && ck === ':') { if (ter > 0) ter--; else { cut = k; break; } }
            }
            if (cut >= 0) { fmt = inner.slice(cut + 1); inner = inner.slice(0, cut); }
            var al = /,\s*-?\d+\s*$/.exec(inner); if (al) inner = inner.slice(0, al.index);
            if (cur) { parts.push({ s: cur }); cur = ''; }
            parts.push({ e: inner, fmt: fmt, line: line });
            i = j + 1; continue;
          }
          if (interp && ch === '}' && src[i + 1] === '}') { cur += '}'; i += 2; continue; }
          cur += ch; i++;
        }
        if (interp) { if (cur) parts.push({ s: cur }); push('istr', parts); } else push('str', cur);
        continue;
      }
      if (c === "'") {
        var j2 = i + 1, v;
        if (src[j2] === '\\') { var r2 = esc(src[j2 + 1], src, j2 + 1); v = r2[0]; j2 = r2[1]; } else { v = src[j2]; j2++; }
        i = j2 + 1; push('str', v, { chr: true }); continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        var m = /^(0[xX][0-9a-fA-F_]+|[0-9][0-9_]*\.?[0-9_]*([eE][+-]?[0-9]+)?|\.[0-9]+([eE][+-]?[0-9]+)?)[uUlLfFdDmM]*/.exec(src.slice(i, i + 40));
        var txt = m[0], core = txt.replace(/[uUlLfFdDmM]+$/, '').replace(/_/g, '');
        if (/^0[xX]/.test(txt)) core = txt.replace(/[uUlL]+$/, '').replace(/_/g, '');
        if (/^\d+\.$/.test(core) && (src[i + txt.length] === '.' || /[a-zA-Z_]/.test(src[i + txt.length] || ''))) { core = core.slice(0, -1); txt = txt.slice(0, -1); }
        if (/^0[0-9]+$/.test(core)) core = String(Number(core));
        push('num', core); i += txt.length; continue;
      }
      if (/[A-Za-z_@]/.test(c) || c > '\x7f') {
        var j3 = i + 1; while (j3 < n && /[\w\u0080-\uffff]/.test(src[j3])) j3++;
        push('id', src.slice(i, j3).replace(/^@/, '')); i = j3; continue;
      }
      var op = null;
      for (var oi = 0; oi < OPS.length; oi++) if (src.substr(i, OPS[oi].length) === OPS[oi]) { op = OPS[oi]; break; }
      if (!op) op = c;
      if (op === '?' && src[i + 1] === '[' && !/^[\],]/.test(src[i + 2] || '') && /\w|\)|\]/.test(src[i - 1] || '')) { push('op', '?.'); i += 1; continue; }
      if (op === '?') { var mq = /^\s+\.(?![.0-9])/.exec(src.slice(i + 1, i + 40)); if (mq) { push('op', '?.'); i += 1 + mq[0].length; continue; } }
      push('op', op); i += op.length;
    }
    push('eof', '');
    return t;
  }

  // =============================== PARSER / EMITTER ===============================
  var RESERVED = {}; ('if else for foreach while do switch case default break continue return throw try catch finally new this base null true false typeof sizeof is as in out ref params lock using class struct interface enum namespace public private protected internal static readonly const virtual override abstract sealed async await void get set operator implicit explicit event delegate checked unchecked goto yield unsafe fixed extern').split(' ').forEach(function (k) { RESERVED[k] = 1; });
  var MODS = {}; ('public private protected internal static readonly const virtual override abstract sealed async extern unsafe volatile partial new').split(' ').forEach(function (k) { MODS[k] = 1; });
  var TYPEMAP = { string: 'CsString', String: 'CsString', int: 'CsInt', Int32: 'CsInt', Int64: 'CsInt', long: 'CsInt', Math: 'CsMath', Console: 'CsConsole', Convert: 'CsConvert', Thread: 'CsThread', Task: 'CsTask', Environment: 'CsEnv', DateTime: 'CsDateTime', Enumerable: 'CsEnumerable', double: 'CsDouble', Double: 'CsDouble', float: 'CsDouble', Boolean: 'CsBool', bool: 'CsBool', char: 'CsChar', Char: 'CsChar', Guid: 'CsGuid', TimeSpan: 'CsTimeSpan', Path: 'CsPath', File: 'CsFile', Directory: 'CsFile', Regex: 'CsRegex', Stopwatch: 'CsStopwatch', Interlocked: 'CsInterlocked', Random: 'CsRandom' };
  var PRIM = { int: 1, long: 1, double: 1, float: 1, string: 1, char: 1, bool: 1, byte: 1, short: 1, uint: 1, ulong: 1, ushort: 1, decimal: 1, object: 1, sbyte: 1, Int32: 1, Int64: 1 };

  function Parser(toks, sigs, opts) {
    this.t = toks; this.i = 0; this.sigs = sigs || {}; this.newSigs = {}; this.sigLists = Object.create(null); this.unres = []; this.opts = opts || {};
    this.ovl = (opts && opts.ovl) || null; this.ovlCount = Object.create(null); this.ovlIdx = Object.create(null);
    this.scopes = []; this.cls = null; this.asyncOk = true; this.hoist = null; this.lambdaDepth = 0; this.catchVar = null; this.tmpN = 0;
    this.out = []; this.sriptClass = null;
  }
  var PP = Parser.prototype;
  PP.peek = function (o) { return this.t[Math.min(this.i + (o || 0), this.t.length - 1)]; };
  PP.next = function () { var x = this.t[this.i]; if (this.i < this.t.length - 1) this.i++; return x; };
  PP.is = function (v, o) { var x = this.peek(o); return (x.t === 'op' || x.t === 'id') && x.v === v; };
  PP.accept = function (v) { if (this.is(v)) { this.next(); return true; } return false; };
  PP.fail = function (m) { var x = this.peek(); throw CsError(m + ' perto de "' + (x.t === 'istr' ? '$"..."' : x.v) + '"', x.line); };
  PP.expect = function (v) { if (!this.accept(v)) this.fail('esperado "' + v + '"'); };
  PP.ident = function () { var x = this.peek(); if (x.t !== 'id') this.fail('esperado identificador'); this.next(); return x.v; };
  PP.pushScope = function () { this.scopes.push({}); };
  PP.popScope = function () { this.scopes.pop(); };
  PP.declare = function (n) { if (this.scopes.length) this.scopes[this.scopes.length - 1][n] = 1; };
  PP.isLocal = function (n) { for (var i = this.scopes.length - 1; i >= 0; i--) if (this.scopes[i][n]) return true; return false; };
  PP.tmp = function () { var n = '__t' + (this.tmpN++); if (this.hoist) this.hoist[n] = 1; return n; };

  // ---- tipos ----
  PP.skipAttributes = function () { while (this.is('[')) { var d = 0; do { if (this.is('[')) d++; else if (this.is(']')) d--; this.next(); } while (d > 0 && this.peek().t !== 'eof'); } };
  PP.skipGenericParams = function () { if (this.is('<')) { var d = 0; do { var x = this.next(); if (x.v === '<') d++; else if (x.v === '>') d--; else if (x.v === '>>') d -= 2; } while (d > 0 && this.peek().t !== 'eof'); } };
  PP.rangeAhead = function () { var d = 0, k = 0, t; while (true) { t = this.peek(k); if (t.t === 'eof') return false; if (t.t === 'op') { if (t.v === '(' || t.v === '[' || t.v === '{') d++; else if (t.v === ')' || t.v === '}') d--; else if (t.v === ']') { if (d === 0) return false; d--; } else if (t.v === '..' && d === 0) return true; else if ((t.v === ';') && d === 0) return false; } k++; } };
  PP.parseUnaryOnly = function () { var pe = this.parseExpr(); return '(' + pe + ')'; };

  PP.bindVar = function (n) { this.declare(n); if (this.hoist) this.hoist[n] = 1; };
  PP.parsePat = function (sv) { return this.parsePatOr(sv); };
  PP.parsePatOr = function (sv) { var l = this.parsePatAnd(sv); while (this.is('or')) { this.next(); l = '(' + l + ' || ' + this.parsePatAnd(sv) + ')'; } return l; };
  PP.parsePatAnd = function (sv) { var l = this.parsePatPrim(sv); while (this.is('and')) { this.next(); l = '(' + l + ' && ' + this.parsePatPrim(sv) + ')'; } return l; };
  PP.parsePatPrim = function (sv) {
    var t = this.peek();
    if (this.accept('not')) return '(!' + this.parsePatPrim(sv) + ')';
    if (this.is('(') ) { this.next(); var inner = this.parsePatOr(sv); this.expect(')'); return inner; }
    if (this.is('null')) { this.next(); return '(' + sv + ' == null)'; }
    if (t.t === 'op' && /^(<|>|<=|>=)$/.test(t.v)) { this.next(); var neg = this.accept('-') ? '-' : ''; return '(' + sv + ' ' + t.v + ' ' + neg + this.patConst() + ')'; }
    if (t.t === 'op' && t.v === '{') return this.parsePatProps(sv, null);
    if (t.t === 'id' && t.v === 'var' && this.peek(1).t === 'id') { this.next(); var vn = this.ident(); this.bindVar(vn); return '((' + vn + ' = ' + sv + '), true)'; }
    if (t.t === 'id' && t.v === '_') { this.next(); return 'true'; }
    if (t.t === 'num' || t.t === 'str' || (t.t === 'op' && t.v === '-') || (t.t === 'id' && (t.v === 'true' || t.v === 'false'))) { var ng = this.accept('-') ? '-' : ''; return '(' + sv + ' == ' + ng + this.patConst() + ')'; }
    if (t.t === 'id') {
      var s0 = this.i, ty = this.tryType();
      if (ty && this.is('{')) return this.parsePatProps(sv, ty);
      if (ty && ty.name.indexOf('.') < 0 && this.peek().t === 'id' && !RESERVED[this.peek().v] && !/^(and|or|when)$/.test(this.peek().v)) { var bn = this.ident(); this.bindVar(bn); return '(__is(' + sv + ', "' + ty.name + '") && ((' + bn + ' = ' + sv + '), true))'; }
      this.i = s0;
      var first = this.next().v, ex = this.refName(first);
      while (this.is('.') && this.peek(1).t === 'id') { this.next(); ex += '.' + this.next().v; }
      if (ex.indexOf('.') < 0 && /^[A-Z]/.test(first) && !this.isLocal(first) && !(this.cls && (this.cls.members.inst[first] || this.cls.members.stat[first]))) return '__is(' + sv + ', "' + first + '")';
      return '(' + sv + ' == ' + ex + ')';
    }
    this.fail('padrão não suportado');
  };
  PP.patConst = function () {
    var t = this.next();
    if (t.t === 'num') return t.v;
    if (t.t === 'str') return t.chr ? JSON.stringify(t.v) : JSON.stringify(t.v);
    if (t.t === 'id') { var ex = this.refName(t.v); while (this.is('.') && this.peek(1).t === 'id') { this.next(); ex += '.' + this.next().v; } return ex; }
    this.fail('constante inválida no padrão');
  };
  PP.parsePatProps = function (sv, ty) {
    this.expect('{'); var parts = [];
    if (ty) parts.push('__is(' + sv + ', "' + ty.name + '")'); else parts.push('(' + sv + ' != null)');
    while (!this.is('}')) {
      var nm = this.ident(); while (this.is('.') && this.peek(1).t === 'id') { this.next(); nm += '.' + this.next().v; }
      this.expect(':');
      var mem = nm.split('.').map(function (q) { return q === 'Count' ? 'length' : (MEMBERMAP[q] || q); }).join('.');
      parts.push(this.parsePatOr(sv + '.' + mem));
      if (!this.accept(',')) break;
    }
    this.expect('}');
    if (this.peek().t === 'id' && !RESERVED[this.peek().v] && !/^(and|or|when)$/.test(this.peek().v)) { var bn = this.ident(); this.bindVar(bn); parts.push('((' + bn + ' = ' + sv + '), true)'); }
    return '(' + parts.join(' && ') + ')';
  };
  PP.parseSwitchExpr = function (l) {
    this.expect('{'); var arms = [];
    while (!this.is('}')) {
      var pt = this.parsePatOr('__s'), when = '';
      if (this.is('when')) { this.next(); when = this.parseExpr(); }
      this.expect('=>');
      var ex = this.is('throw') ? (this.next(), '(() => { throw ' + this.parseExpr() + '; })()') : this.parseExpr();
      arms.push('if (' + pt + (when ? ' && (' + when + ')' : '') + ') return ' + ex + ';');
      if (!this.accept(',')) break;
    }
    this.expect('}');
    return '(await (async (__s) => { ' + arms.join(' ') + ' throw new Error("switch sem correspondência"); })(' + l + '))';
  };
  PP.nullableAhead = function () {
    if (!this.is('?')) return false;
    var a = this.peek(1), b = this.peek(2);
    if (a.t === 'op') return /^(,|\)|=|>|;|\[)$/.test(a.v);
    if (a.t === 'id' && !RESERVED[a.v] && b.t === 'op' && /^(,|\)|=|;|=>|\{|\()$/.test(b.v)) return true;
    return false;
  };
  PP.tryDeconstruct = function (follow) {
    var s0 = this.i, names = [];
    if (this.is('var') && this.is('(', 1)) this.next();
    if (!this.is('(')) { this.i = s0; return null; }
    this.next();
    while (true) {
      if (this.is('(')) { var sub = this.tryDeconstruct(); if (sub) { names.push('[' + sub.join(', ') + ']'); if (!this.accept(',')) break; continue; } }
      var s1 = this.i; var t1 = this.tryType();
      if (t1 && this.peek().t === 'id' && !RESERVED[this.peek().v]) names.push(this.next().v);
      else { this.i = s1; if (this.peek().t === 'id' && !RESERVED[this.peek().v]) names.push(this.next().v); else if (this.is('_')) names.push('_'); else { this.i = s0; return null; } }
      if (!this.accept(',')) break;
    }
    if (!this.accept(')') || names.length < 2 || (follow && !(this.is(follow) && !this.is('==')))) { this.i = s0; return null; }
    return names;
  };
  PP.tryType = function () {
    var s = this.i;
    var ty = this._type();
    if (!ty) this.i = s;
    return ty;
  };
  PP._type = function () {
    var x = this.peek(); var name;
    if (this.is('(')) { // tipo tupla
      var ts = this.i; this.next(); var tn = [], cnt = 0, bad = false;
      while (true) { var tt = this._type(); if (!tt) { bad = true; break; } cnt++; if (this.peek().t === 'id' && !RESERVED[this.peek().v]) tn.push(this.next().v); else tn.push(null); if (!this.accept(',')) break; }
      if (bad || cnt < 2 || !this.accept(')')) { this.i = ts; return null; }
      while (this.is('[') && (this.is(']', 1) || this.is(',', 1))) { this.next(); while (!this.is(']')) this.next(); this.next(); }
      if (this.nullableAhead()) this.next();
      this.lastType = 'Tuple'; return { name: 'Tuple', tnames: tn };
    }
    if (x.t !== 'id' || (RESERVED[x.v] && !PRIM[x.v] && x.v !== 'void')) return null;
    name = this.next().v;
    while (this.is('.') && this.peek(1).t === 'id') { this.next(); name += '.' + this.next().v; }
    if (this.is('<')) {
      this.next(); var ok = true;
      while (true) {
        if (this.is('>') || this.is('>>')) break;
        if (!this._type()) { ok = false; break; }
        if (this.accept(',')) continue; break;
      }
      if (!ok) return null;
      if (this.is('>>')) { var gtk = this.t[this.i]; this.t.splice(this.i, 1, { t: 'op', v: '>', line: gtk.line }, { t: 'op', v: '>', line: gtk.line }); this.next(); } else if (this.is('>')) this.next(); else return null;
    }
    while (this.is('?') && !(this.peek(1).t === 'op' && /^[?.]/.test(this.peek(1).v))) { // nullable
      var nx = this.peek(1); if (nx.t === 'id' && !RESERVED[nx.v] || nx.t === 'op' && (nx.v === '[' )) { this.next(); continue; }
      if (nx.t === 'id' && (this.peek(2).t === 'op' && /^(=|;|,|\))$/.test(this.peek(2).v))) { this.next(); continue; }
      break;
    }
    while (this.is('[') && (this.is(']', 1) || (this.is(',', 1)))) { this.next(); while (!this.is(']')) this.next(); this.next(); }
    if (this.is('?') && !(this.peek(1).t === 'op' && this.peek(1).v === '.') ) { var n2 = this.peek(1); if (n2.t === 'id' && !RESERVED[n2.v]) { /* ternário */ } }
    if (this.nullableAhead()) this.next();
    while (this.is('[') && (this.is(']', 1) || (this.is(',', 1)))) { this.next(); while (!this.is(']')) this.next(); this.next(); }
    if (this.nullableAhead()) this.next();
    this.lastType = name; return { name: name };
  };

  // ---- unidade ----
  PP.parseUnit = function () {
    var out = [];
    while (this.peek().t !== 'eof') {
      if (this.is('using')) { while (!this.is(';') && this.peek().t !== 'eof') this.next(); this.next(); continue; }
      if (this.is('namespace')) { this.next(); while (!this.is('{') && !this.is(';')) this.next(); this.next(); continue; }
      if (this.is('}') || this.is(';')) { this.next(); continue; }
      var c = this.parseTypeDecl(); if (c) out.push(c);
    }
    return out.join('\n');
  };
  PP.parseTypeDecl = function () {
    this.skipAttributes();
    while (this.peek().t === 'id' && MODS[this.peek().v] && !this.is('class') ) this.next();
    this.skipAttributes();
    var kw = this.peek().v;
    if (kw === 'class' || kw === 'struct' || kw === 'record') return this.parseClass();
    if (kw === 'enum') return this.parseEnum();
    if (kw === 'interface') { this.next(); this.ident(); this.skipGenericParams(); while (!this.is('{')) this.next(); this.skipBlock(); return ''; }
    if (kw === 'delegate') { while (!this.is(';')) this.next(); this.next(); return ''; }
    this.fail('declaração não suportada');
  };
  PP.skipBlock = function () { var d = 0; do { if (this.is('{')) d++; else if (this.is('}')) d--; this.next(); } while (d > 0 && this.peek().t !== 'eof'); };
  PP.parseEnum = function () {
    this.next(); var name = this.ident(); if (this.accept(':')) this._type(); this.expect('{');
    var items = [], v = 0;
    while (!this.is('}')) { this.skipAttributes(); var n = this.ident(); if (this.accept('=')) { var e = this.parseExpr(); items.push(n + ':' + e); var num = Number(e); v = isNaN(num) ? v : num; } else items.push(n + ':' + v); v++; if (!this.accept(',')) break; }
    this.expect('}');
    return 'var ' + name + ' = {' + items.join(',') + '};';
  };
  PP.parseClass = function () {
    this.next(); var name = this.ident(); this.skipGenericParams();
    var base = null;
    if (this.accept(':')) { while (!this.is('{') && !this.is('where') && this.peek().t !== 'eof') this.next(); }
    while (this.is('where')) { while (!this.is('{')) this.next(); }
    // pré-varredura: nomes de membros
    this.expect('{');
    var start = this.i, members = { inst: {}, stat: {} }, depth = 1, j = this.i, toks = this.t;
    // coleta de nomes de membros (nível 1)
    var lvl = 1, sawStatic = false, last = null, k = j;
    var stmtStart = true, mods = {}, prevId = null, prev2 = null, typeDecl = false;
    for (; k < toks.length && lvl > 0; k++) {
      var tk = toks[k];
      if (tk.t === 'op' && tk.v === '{') { if (lvl === 1 && prevId && !typeDecl) { addM(prevId, mods); } if (lvl === 1) { prevId = null; typeDecl = false; } lvl++; continue; }
      if (tk.t === 'op' && tk.v === '}') { lvl--; if (lvl === 1) { mods = {}; stmtStart = true; prevId = null; } continue; }
      if (lvl !== 1) continue;
      if (tk.t === 'op' && tk.v === '[' && stmtStart) { var dd = 0; do { if (toks[k].v === '[') dd++; else if (toks[k].v === ']') dd--; k++; } while (dd > 0 && k < toks.length); k--; continue; }
      if (tk.t === 'op' && (tk.v === '(' )) { if (prevId) { addM(prevId, mods); prevId = null; } var dp = 0; do { if (toks[k].v === '(' && toks[k].t === 'op') dp++; else if (toks[k].v === ')' && toks[k].t === 'op') dp--; k++; } while (dp > 0 && k < toks.length); k--; continue; }
      if (tk.t === 'op' && (tk.v === ';' || tk.v === '=' || tk.v === '=>' || tk.v === ',')) {
        if (prevId) { addM(prevId, mods); prevId = null; }
        if (tk.v === ';') { mods = {}; stmtStart = true; continue; }
        if (tk.v === '=' || tk.v === '=>') { var d2 = 0; for (k = k + 1; k < toks.length; k++) { var t2 = toks[k]; if (t2.t === 'op') { if (t2.v === '(' || t2.v === '{' || t2.v === '[') d2++; else if (t2.v === ')' || t2.v === '}' || t2.v === ']') { if (d2 === 0) break; d2--; } else if (t2.v === ';' && d2 === 0) break; else if (t2.v === ',' && d2 === 0 && tk.v === '=') { prevId = null; break; } } } if (toks[k] && toks[k].v === ';') { mods = {}; stmtStart = true; } else if (toks[k] && toks[k].v === '}') k--; }
        continue;
      }
      if (tk.t === 'id') { stmtStart = false; if (MODS[tk.v] && tk.v !== 'new') mods[tk.v] = 1; else if (!prevId && (tk.v === 'enum' || tk.v === 'class' || tk.v === 'struct' || tk.v === 'interface' || tk.v === 'record')) { typeDecl = true; prevId = tk.v; } else prevId = tk.v; }
    }
    function addM(n, m) { if (RESERVED[n] && n !== 'get' && n !== 'set') return; (m.static || m.const ? members.stat : members.inst)[n] = 1; }
    var saveCls = this.cls; this.cls = { name: name, members: members, ovlMeta: {} }; if (this.opts.collectClasses) this.opts.collectClasses.push(this.cls);
    var parts = [], ctorFields = [], hasCtor = false, extra = [];
    while (!this.is('}')) {
      if (this.peek().t === 'eof') this.fail('fim inesperado na classe ' + name);
      if (this.is(';')) { this.next(); continue; }
      var m = this.parseMember(name, extra); if (m) parts.push(m);
    }
    this.expect('}');
    var ovlMeta = this.cls.ovlMeta;
    Object.keys(ovlMeta).forEach(function (k) {
      var o = ovlMeta[k], tbl = JSON.stringify(o.list);
      parts.push((o.isStatic ? 'static ' : '') + 'async ' + o.name + '(...a) { return await ' + (o.isStatic ? name : 'this') + '[__ovl(' + tbl + ', a).f](...a); }');
    });
    this.cls = saveCls;
    var js = 'class ' + name + ' {\n' + parts.join('\n') + '\n}';
    return js + (extra.length ? '\n' + extra.join('\n') : '');
  };

  PP.parseMember = function (cname, extra) {
    this.skipAttributes();
    var mods = {};
    while (this.peek().t === 'id' && MODS[this.peek().v] && !(this.peek(1).t === 'op' && ((this.peek(1).v === '(' && !/^(public|private|protected|internal|static|readonly|override|virtual|abstract|sealed|const)$/.test(this.peek().v)) || this.peek(1).v === '=' || this.peek(1).v === ';'))) { mods[this.next().v] = 1; }
    this.skipAttributes();
    var kw = this.peek().v;
    if (kw === 'class' || kw === 'struct' || kw === 'enum' || kw === 'interface' || kw === 'record' || kw === 'delegate') { var sub = this.parseTypeDecl(); if (sub) { var nm = /^\s*(?:var|class)\s+(\w+)/.exec(sub); extra.push(sub + (nm && this.cls && this.cls.name ? '\n' + this.cls.name + '.' + nm[1] + ' = ' + nm[1] + ';' : '')); } return ''; }
    var isStatic = !!(mods.static || mods.const);
    var prefix = isStatic ? 'static ' : '';
    // construtor
    if (this.peek().t === 'id' && this.peek().v === cname && this.is('(', 1)) {
      this.next(); var ps = this.parseParams(); if (this.accept(':')) { while (!this.is('{')) { this.next(); if (this.is('(')) { var d = 0; do { if (this.is('(')) d++; else if (this.is(')')) d--; this.next(); } while (d > 0); } } }
      var body = this.parseFunctionBody(ps, false, false);
      return (isStatic ? 'static ' : '') + 'constructor(' + ps.js + ') { ' + body + ' }';
    }
    if (this.is('~')) { this.fail('destrutor não suportado'); }
    var ty = this.tryType(); if (!ty) this.fail('membro de classe inválido');
    if (this.is('operator') || ty.name === 'implicit' || ty.name === 'explicit') this.fail('operadores sobrecarregados não suportados');
    if (this.is('this') && this.is('[', 1)) this.fail('indexadores não suportados');
    var name = this.ident();
    this.skipGenericParams();
    if (this.is('(')) { // método
      var p = this.parseParams(); while (this.is('where')) { while (!this.is('{') && !this.is('=>') && !this.is(';')) this.next(); }
      this.newSigs[(isStatic ? cname + '.' : '') + name] = p.names;
      (this.sigLists[(isStatic ? cname + '.' : '') + name] = this.sigLists[(isStatic ? cname + '.' : '') + name] || []).push(p.names);
      if (this.is(';')) { this.next(); return ''; } // abstrato
      var isAsync = true;
      // sobrecargas (mesmo nome, parâmetros diferentes): JS só guarda a última; renomeia cada uma e gera um despachante
      var okey = cname + '|' + (isStatic ? 's' : 'i') + '|' + name, emitName = name;
      this.ovlCount[okey] = (this.ovlCount[okey] || 0) + 1;
      if (this.ovl && this.ovl[okey] > 1 && this.cls) {
        var oix = this.ovlIdx[okey] = (this.ovlIdx[okey] || 0) + 1; emitName = name + '$ov' + oix;
        var om = this.cls.ovlMeta[okey] = this.cls.ovlMeta[okey] || { name: name, isStatic: isStatic, list: [] };
        om.list.push({ f: emitName, t: p.types, o: p.opt, p: p.prm });
      }
      var b;
      if (this.accept('=>')) { var save = this.snapshotFn(p, true); var e = this.parseExpr(); this.expect(';'); b = this.finishFn(save, 'return ' + e + ';'); }
      else b = this.parseFunctionBody(p, true, true);
      if (p.ext && isStatic && extra) { var extKey = 'ext$' + cname + '$' + name; if (!this.extSeen) this.extSeen = {}; if (!this.extSeen[extKey]) { this.extSeen[extKey] = 1; extra.push('__ext(' + cname + ', ' + JSON.stringify(name) + ', ' + JSON.stringify(p.types[0]) + ');'); } }
      return prefix + 'async ' + emitName + '(' + p.js + ') { ' + b + ' }';
    }
    // propriedade
    if (this.is('{') || this.is('=>')) {
      if (this.accept('=>')) { var sv = this.snapshotFn({ names: [] }, false); var ex = this.parseExpr(); this.expect(';'); return prefix + 'get ' + name + '() { ' + this.finishFn(sv, 'return ' + ex + ';') + ' }'; }
      this.next(); var getter = null, setter = null, auto = false;
      while (!this.is('}')) {
        this.skipAttributes(); while (this.peek().t === 'id' && MODS[this.peek().v]) this.next();
        var acc = this.ident();
        if (this.accept(';')) { auto = true; continue; }
        if (this.accept('=>')) { var s1 = this.snapshotFn({ names: [] }, false); var e1 = this.parseExpr(); this.expect(';'); (acc === 'get' ? (getter = this.finishFn(s1, 'return ' + e1 + ';')) : (setter = this.finishFn(s1, e1 + ';'))); continue; }
        var ps2 = { names: [], js: '' }; if (acc === 'set' || acc === 'init') { ps2 = { names: ['value'], js: 'value' }; }
        var bb = this.parseFunctionBody(ps2, false, false);
        if (acc === 'get') getter = bb; else setter = bb;
      }
      this.expect('}');
      var init = null; if (this.accept('=')) { init = this.parseInitializer(); this.expect(';'); }
      if (auto && !getter && !setter) {
        var store = '_p_' + name;
        var o = prefix + 'get ' + name + '() { return this.' + (isStatic ? '' : '') + store + '; } ' + prefix + 'set ' + name + '(v) { this.' + store + ' = v; }';
        if (isStatic) o = 'static get ' + name + '() { return ' + cname + '.' + store + '; } static set ' + name + '(v) { ' + cname + '.' + store + ' = v; }';
        if (init !== null) { return o + '\n' + (isStatic ? 'static { ' + cname + '.' + store + ' = ' + init + '; }' : this.fieldInit(store, init)); }
        return o;
      }
      var o2 = '';
      if (getter !== null) o2 += prefix + 'get ' + name + '() { ' + getter + ' } ';
      if (setter !== null) o2 += prefix + 'set ' + name + '(value) { ' + setter + ' }';
      return o2;
    }
    // campo(s)
    var decls = [];
    while (true) {
      var init2 = 'undefined'; if (this.accept('=')) init2 = this.parseInitializer();
      decls.push([name, init2]);
      if (this.accept(',')) { name = this.ident(); continue; }
      break;
    }
    this.expect(';');
    var res = [];
    decls.forEach(function (d) { res.push(isStatic ? 'static ' + d[0] + ' = ' + d[1] + ';' : d[0] + ' = ' + d[1] + ';'); });
    return res.join('\n');
  };
  PP.fieldInit = function (store, init) { return store + ' = ' + init + ';'; };
  PP.parseInitializer = function () {
    var save = this.snapshotFn({ names: [] }, false, true);
    var e;
    if (this.is('{')) e = this.parseArrayLiteral(); else e = this.parseExpr();
    var hd = this.finishFnExpr(save);
    return hd ? '(function(){ ' + hd + ' return ' + e + '; }).call(this)' : e;
  };

  // ---- funções ----
  PP.parseParams = function () {
    this.expect('('); var names = [], js = [], defs = [], ptypes = [], popt = [], pprm = [], isExt = false;
    this.pushScope();
    while (!this.is(')')) {
      this.skipAttributes();
      var isParams = false;
      while (this.is('this') || this.is('ref') || this.is('out') || this.is('in') || this.is('params')) { if (this.is('params')) isParams = true; if (this.is('this') && !names.length) isExt = true; this.next(); }
      var ts0 = this.i;
      var ty = this.tryType(); if (!ty) this.fail('parâmetro inválido');
      var tyTxt = this.t.slice(ts0, this.i).map(function (tk) { return tk.v; }).join('');
      var n = this.ident(); this.declare(n); names.push(n);
      var d = null;
      if (this.accept('=')) { var sv = this.snapshotFn({ names: [] }, false, true); d = this.parseExpr(); this.finishFnExpr(sv); }
      ptypes.push(tyTxt); popt.push(d !== null); pprm.push(isParams);
      js.push(isParams ? '...' + n : (d !== null ? n + ' = ' + d : n));
      if (!this.accept(',')) break;
    }
    this.expect(')');
    var scope = this.scopes.pop();
    return { names: names, js: js.join(', '), scope: scope, types: ptypes, opt: popt, prm: pprm, ext: isExt };
  };
  PP.snapshotFn = function (p, asyncOk, keep) {
    var s = { scopes: this.scopes, asyncOk: this.asyncOk, hoist: this.hoist, tmpN: this.tmpN, catchVar: this.catchVar };
    if (!keep) this.scopes = this.scopes.slice(); else this.scopes = this.scopes.slice();
    var sc = {}; (p.names || []).forEach(function (n) { sc[n] = 1; }); this.scopes.push(sc);
    this.asyncOk = !!asyncOk; this.hoist = {}; s.localHoist = this.hoist; return s;
  };
  PP.finishFn = function (s, bodyJs) {
    var h = Object.keys(s.localHoist); var decl = h.length ? 'var ' + h.join(', ') + '; ' : '';
    this.scopes = s.scopes; this.asyncOk = s.asyncOk; this.hoist = s.hoist; this.catchVar = s.catchVar;
    return decl + bodyJs;
  };
  PP.finishFnExpr = function (s) { var h = Object.keys(s.localHoist); this.scopes = s.scopes; this.asyncOk = s.asyncOk; this.hoist = s.hoist; this.catchVar = s.catchVar; return h.length ? 'var ' + h.join(', ') + ';' : ''; };
  PP.parseFunctionBody = function (p, asyncOk, isMethod) {
    var s = this.snapshotFn(p, asyncOk);
    var b = this.parseBlock(true);
    return this.finishFn(s, b);
  };

  // ---- statements ----
  PP.gotoBlock = function (stmts) {
    var id = this.gotoN = (this.gotoN || 0) + 1, g = '__g' + id, lb = '__l' + id, idx = {}, k = 0;
    stmts.forEach(function (q) { var m = /^\/\*LABEL:(\w+)\*\/$/.exec(q); if (m) idx[m[1]] = ++k; });
    var out = ['case 0:'];
    stmts.forEach(function (q) {
      var m = /^\/\*LABEL:(\w+)\*\/$/.exec(q);
      if (m) { out.push('case ' + idx[m[1]] + ':'); return; }
      out.push(String(q).replace(/^let /, 'var '));
    });
    var body = out.join('\n').replace(/\/\*GOTO:(\w+)\*\//g, function (_, n) { return idx[n] !== undefined ? '{ ' + g + ' = ' + idx[n] + '; continue ' + lb + '; }' : '/*GOTO:' + n + '*/'; });
    return 'var ' + g + ' = 0; ' + lb + ': while (true) { switch (' + g + ') {\n' + body + '\n} break; }';
  };
  PP.parseBlock = function (noScope) {
    this.expect('{'); if (!noScope) this.pushScope();
    var stmts = [], fns = [];
    while (!this.is('}')) {
      if (this.peek().t === 'eof') this.fail('chave } faltando');
      var r = this.parseStatement();
      if (r && r.fn) fns.push(r.js); else if (r) stmts.push(r.js !== undefined ? r.js : r);
    }
    this.expect('}'); if (!noScope) this.popScope();
    if (stmts.some(function (q) { return typeof q === 'string' && q.indexOf('/*LABEL:') === 0; })) return fns.join('\n') + '\n' + this.gotoBlock(stmts);
    return fns.concat(stmts).join('\n');
  };
  PP.loopBody = function () {
    var b;
    if (this.is('{')) { b = '{ __chk();\n' + this.parseBlock() + '\n}'; }
    else { this.pushScope(); var s = this.parseStatement(); this.popScope(); b = '{ __chk(); ' + (s && s.js !== undefined ? s.js : s) + ' }'; }
    return b;
  };
  PP.body = function () {
    if (this.is('{')) return '{\n' + this.parseBlock() + '\n}';
    this.pushScope(); var s = this.parseStatement(); this.popScope(); return '{ ' + (s && s.js !== undefined ? s.js : s) + ' }';
  };
  PP.isDeclStart = function () {
    var s = this.i, ok = false;
    var dd = this.tryDeconstruct('='); this.i = s; if (dd) return true;
    var ty = this.tryType();
    if (ty && this.peek().t === 'id' && !RESERVED[this.peek().v]) {
      var nx = this.peek(1);
      if (nx.t === 'op' && (nx.v === '=' || nx.v === ';' || nx.v === ',')) ok = true;
      else if (nx.t === 'id' && nx.v === 'in') ok = true;
      else if (nx.t === 'op' && nx.v === '(') ok = 'fn';
      else if (nx.t === 'op' && nx.v === ':' ) ok = false;
    }
    this.i = s; return ok;
  };
  PP.parseDecl = function (isConst) {
    var dn0 = this.tryDeconstruct('=');
    if (dn0) { dn0.join(',').replace(/[\[\]\s]/g, '').split(',').forEach(function (q) { this.declare(q); }, this); this.expect('='); var di = this.parseExpr(); return 'let [' + dn0.join(', ') + '] = ' + di; }
    var dty = this.tryType(); var out = [];
    while (true) {
      var n = this.ident(); var init = null;
      if (dty && dty.tnames) { this.tupNames = this.tupNames || {}; this.tupNames[n] = dty.tnames; }
      if (this.accept('=')) { init = this.is('{') ? this.parseArrayLiteral() : this.parseExpr(); }
      this.declare(n); out.push(n + (init !== null ? ' = ' + init : ''));
      if (!this.accept(',')) break;
    }
    return 'let ' + out.join(', ');
  };
  PP.parseStatement = function () {
    var x = this.peek(), v = x.v;
    while ((v === 'static' || v === 'async') && this.peek(1).t === 'id') { this.next(); x = this.peek(); v = x.v; }
    if (x.t === 'id' && !RESERVED[v] && this.is(':', 1) && !this.is(':', 2)) { this.next(); this.next(); return '/*LABEL:' + v + '*/'; }
    if (x.t === 'op') {
      if (v === '{') return '{\n' + this.parseBlock() + '\n}';
      if (v === ';') { this.next(); return ';'; }
    }
    if (x.t === 'id' || (x.t === 'op' && v === '(')) {
      switch (v) {
        case 'if': {
          this.next(); this.expect('('); var c = this.parseExpr(); this.expect(')');
          var th = this.body(), el = '';
          if (this.accept('else')) { if (this.is('if')) { var r = this.parseStatement(); el = ' else ' + (r.js !== undefined ? r.js : r); } else el = ' else ' + this.body(); }
          return 'if (' + c + ') ' + th + el;
        }
        case 'while': { this.next(); this.expect('('); var wc = this.parseExpr(); this.expect(')'); return 'while (' + wc + ') ' + this.loopBody(); }
        case 'do': { this.next(); var db = this.loopBody(); this.expect('while'); this.expect('('); var dc = this.parseExpr(); this.expect(')'); this.accept(';'); return 'do ' + db + ' while (' + dc + ');'; }
        case 'for': {
          this.next(); this.expect('('); this.pushScope();
          var init = '';
          if (!this.is(';')) { if (this.isDeclStart() === true) init = this.parseDecl(); else { var es = []; do { es.push(this.parseExpr()); } while (this.accept(',')); init = es.join(', '); } }
          this.expect(';'); var cond = this.is(';') ? '' : this.parseExpr(); this.expect(';');
          var it = []; if (!this.is(')')) { do { it.push(this.parseExpr()); } while (this.accept(',')); }
          this.expect(')'); var fb = this.loopBody(); this.popScope();
          return 'for (' + init + '; ' + cond + '; ' + it.join(', ') + ') ' + fb;
        }
        case 'foreach': {
          this.next(); this.expect('('); this.pushScope();
          var dn = this.tryDeconstruct('in');
          if (dn) { dn.join(',').replace(/[\[\]\s]/g, '').split(',').forEach(function (q) { this.declare(q); }, this); this.expect('in'); var coll0 = this.parseExpr(); this.expect(')'); var fb0 = this.loopBody(); this.popScope(); return 'for (let [' + dn.join(', ') + '] of (' + coll0 + ')) ' + fb0; }
          var fty = this.tryType(); var vn = this.ident(); this.declare(vn); if (fty && fty.tnames) { this.tupNames = this.tupNames || {}; this.tupNames[vn] = fty.tnames; } this.expect('in'); var coll = this.parseExpr(); this.expect(')');
          var fb2 = this.loopBody(); this.popScope();
          return 'for (let ' + vn + ' of (' + coll + ')) ' + fb2;
        }
        case 'switch': return this.parseSwitch();
        case 'return': { this.next(); if (this.accept(';')) return 'return;'; var rv = this.parseExpr(); this.expect(';'); return 'return ' + rv + ';'; }
        case 'break': this.next(); this.expect(';'); return 'break;';
        case 'continue': this.next(); this.expect(';'); return 'continue;';
        case 'throw': { this.next(); if (this.accept(';')) return 'throw ' + (this.catchVar || '__e') + ';'; var tv = this.parseExpr(); this.expect(';'); return 'throw ' + tv + ';'; }
        case 'try': return this.parseTry();
        case 'lock': { this.next(); this.expect('('); this.parseExpr(); this.expect(')'); return this.body(); }
        case 'using': {
          this.next();
          if (this.is('(')) { this.next(); this.pushScope(); var ud = this.isDeclStart() === true ? this.parseDecl() : this.parseExpr(); this.expect(')'); var ub = this.body(); this.popScope(); return '{ ' + ud + '; ' + ub + ' }'; }
          var d2 = this.parseDecl(); this.expect(';'); return d2 + ';';
        }
        case 'const': { this.next(); var cd = this.parseDecl(true); this.expect(';'); return cd.replace(/^let/, 'const') + ';'; }
        case 'goto': { this.next();
          if (this.is('case') || this.is('default')) { var dflt = this.is('default'); this.next(); var gc = dflt ? null : this.parseExpr(); this.expect(';'); var top = (this.swStack || [])[(this.swStack || []).length - 1]; if (!top) this.fail('goto case fora de switch'); top.used = true; return '{ ' + (dflt ? '' : top.sv + ' = ' + gc + ';') + ' continue ' + top.lb + '; }'; }
          var gl = this.ident(); this.expect(';'); return '/*GOTO:' + gl + '*/'; }
        case 'yield': case 'unsafe': case 'fixed': this.fail('"' + v + '" não suportado');
      }
      var dk = this.isDeclStart();
      if (dk === 'fn') { // função local
        this.tryType(); var fname = this.ident(); var p = this.parseParams(); this.declare(fname);
        var fb3; var sv = this.snapshotFn(p, true);
        if (this.accept('=>')) { var ee = this.parseExpr(); this.expect(';'); fb3 = this.finishFn(sv, 'return ' + ee + ';'); } else { var bb = this.parseBlock(true); fb3 = this.finishFn(sv, bb); }
        return { fn: true, js: 'var ' + fname + ' = async (' + p.js + ') => { ' + fb3 + ' };' };
      }
      if (dk === true) { var dd = this.parseDecl(); this.expect(';'); return dd + ';'; }
    }
    var e = this.parseExpr(); this.expect(';');
    return e + ';';
  };
  PP.parseSwitch = function () {
    this.next(); this.expect('('); var subj = this.parseExpr(); this.expect(')'); this.expect('{'); this.pushScope();
    var id = this.swN = (this.swN || 0) + 1, sv = '__sw' + id, lb = '__lsw' + id;
    this.swStack = this.swStack || []; this.swStack.push({ sv: sv, lb: lb, used: false });
    var out = [], guard = false, vars = [];
    while (!this.is('}')) {
      if (this.accept('default')) { this.expect(':'); out.push({ c: 'default:', g: 'default:' }); }
      else if (this.accept('case')) {
        var pv = null, lab = null, ty = null;
        if (this.is('var') && this.peek(1).t === 'id') { this.next(); pv = this.ident(); }
        else {
          var sv0 = this.i, t0 = this.tryType();
          if (t0 && this.peek().t === 'id' && !RESERVED[this.peek().v] && !this.is('when')) { pv = this.ident(); ty = t0; }
          else { this.i = sv0; lab = this.parseExpr(); }
        }
        var cond = null;
        if (this.is('when')) { this.next(); if (pv) this.declare(pv); cond = this.parseExpr(); guard = true; }
        else if (pv) { this.declare(pv); guard = true; }
        this.expect(':');
        if (pv) { if (vars.indexOf(pv) < 0) vars.push(pv); }
        var gtest = lab !== null ? '(' + sv + ' === ' + lab + ')' : '(' + (pv ? '(' + pv + ' = ' + sv + '), true' : 'true') + ')';
        if (cond !== null) gtest = '(' + gtest + ' && ' + cond + ')';
        out.push({ c: lab !== null ? 'case ' + lab + ':' : null, g: 'case ' + gtest + ':' });
      } else {
        var st = this.parseStatement(); out.push(st && st.js !== undefined ? st.js : st);
      }
    }
    this.expect('}'); this.popScope();
    var info = this.swStack.pop();
    var useG = guard;
    var body = out.map(function (q) { return typeof q === 'string' ? q : (useG ? q.g : q.c); }).join('\n');
    if (!guard && !info.used) return 'switch (' + subj + ') {\n' + body + '\n}';
    return '{ let ' + sv + ' = ' + subj + ';' + (vars.length ? ' let ' + vars.join(', ') + ';' : '') + ' ' + lb + ': for (;;) { switch (' + (guard ? 'true' : sv) + ') {\n' + body + '\n} break; } }';
  };
  PP.parseTry = function () {
    this.next(); var tb = '{\n' + this.parseBlock() + '\n}', cat = '', fin = '';
    var first = true;
    while (this.is('catch')) {
      this.next(); var vn = '__e';
      if (this.accept('(')) { this.tryType(); if (this.peek().t === 'id') vn = this.ident(); this.expect(')'); }
      if (this.is('when')) this.fail('"catch ... when" não suportado');
      this.pushScope(); this.declare(vn); var sv = this.catchVar; this.catchVar = vn;
      var cb = this.parseBlock(true); this.catchVar = sv; this.popScope();
      if (first) { cat = ' catch (' + vn + ') { if (' + vn + ' && ' + vn + '.message === "__SKUA_STOP__") throw ' + vn + ';\n' + cb + '\n}'; first = false; }
    }
    if (this.accept('finally')) fin = ' finally {\n' + this.parseBlock() + '\n}';
    if (!cat && !fin) fin = ' finally {}';
    return 'try ' + tb + cat + fin;
  };

  // ---- expressões ----
  var BIN = { '??': 1, '||': 2, '&&': 3, '|': 4, '^': 5, '&': 6, '==': 7, '!=': 7, '<': 8, '>': 8, '<=': 8, '>=': 8, 'is': 8, 'as': 8, '<<': 9, '>>': 9, '+': 10, '-': 10, '*': 11, '/': 11, '%': 11 };
  var ASSIGN = { '=': 1, '+=': 1, '-=': 1, '*=': 1, '/=': 1, '%=': 1, '&=': 1, '|=': 1, '^=': 1, '<<=': 1, '>>=': 1, '??=': 1 };
  PP.parseExpr = function () {
    var lhs = this.parseTernary();
    var x = this.peek();
    if (x.t === 'op' && ASSIGN[x.v]) {
      this.next(); var rhs = this.is('{') ? this.parseArrayLiteral() : this.parseExpr();
      var ev = /^(.*)\.Events\.([A-Za-z_]\w*)$/.exec(lhs);
      if (ev && (x.v === '+=' || x.v === '-=')) return '(' + ev[1] + '.Events.' + (x.v === '+=' ? 'On' : 'Off') + '("' + ev[2] + '", ' + rhs + ', this))';
      return '(' + lhs + ' ' + x.v + ' ' + rhs + ')';
    }
    return lhs;
  };
  PP.parseTernary = function () {
    var c = this.parseBin(1);
    if (this.is('?') ) {
      this.next(); var a = this.parseExpr(); this.expect(':'); var b = this.parseExpr();
      return '(' + c + ' ? ' + a + ' : ' + b + ')';
    }
    return c;
  };
  PP.parseBin = function (minp) {
    var l = this.parseUnary();
    while (true) {
      var x = this.peek();
      if (x.t === 'id' && x.v === 'switch' && this.is('{', 1)) { this.next(); l = this.parseSwitchExpr(l); continue; }
      var p = (x.t === 'op' || (x.t === 'id' && (x.v === 'is' || x.v === 'as'))) ? BIN[x.v] : undefined;
      if (!p || p < minp) break;
      if (x.v === '>' && this.is('>', 1) && false) break;
      this.next();
      if (x.v === 'is') {
        l = '((__v) => ' + this.parsePat('__v') + ')(' + l + ')';
        continue;
      }
      if (x.v === 'as') { this.tryType(); continue; }
      var r = this.parseBin(x.v === '??' ? p : p + 1);
      var op = x.v;
      if (op === '==' || op === '!=') { var nullSide = (l === 'null' || r === 'null'); op = nullSide ? op : op + '='; }
      l = '(' + l + ' ' + op + ' ' + r + ')';
    }
    return l;
  };
  var CASTS = { int: 'Math.trunc(Number(%))', long: 'Math.trunc(Number(%))', short: 'Math.trunc(Number(%))', byte: 'Math.trunc(Number(%))', uint: 'Math.trunc(Number(%))', double: 'Number(%)', float: 'Number(%)', decimal: 'Number(%)', string: 'String(%)', char: '__chr(%)', bool: 'Boolean(%)' };
  PP.parseUnary = function () {
    var x = this.peek();
    if (x.t === 'op') {
      if (x.v === '!' ) { this.next(); return '(!' + this.parseUnary() + ')'; }
      if (x.v === '-' || x.v === '+' || x.v === '~') { this.next(); return '(' + x.v + this.parseUnary() + ')'; }
      if (x.v === '++' || x.v === '--') { this.next(); return '(' + x.v + this.parseUnary() + ')'; }
      if (x.v === '(') { // cast?
        var s = this.i; this.next(); var ty = this.tryType();
        if (ty && this.is(')')) {
          this.next(); var nx = this.peek(), prim = !!PRIM[ty.name];
          var startsOperand = nx.t === 'num' || nx.t === 'str' || nx.t === 'istr' || (nx.t === 'id' && !(nx.v === 'is' || nx.v === 'as' || nx.v === 'in' || nx.v === 'when' || nx.v === 'switch' || nx.v === 'and' || nx.v === 'or')) || (nx.t === 'op' && (nx.v === '(' || nx.v === '!' || nx.v === '~' || (prim && (nx.v === '-' || nx.v === '+'))));
          if (startsOperand) { var operand = this.parseUnary(); return CASTS[ty.name] ? CASTS[ty.name].replace('%', operand) : operand; }
        }
        this.i = s;
      }
    }
    if (x.t === 'id' && x.v === 'await') { this.next(); var ax = this.parseUnary(); return this.asyncOk ? '(await ' + ax + ')' : ax; }
    return this.parsePostfix(this.parsePrimary());
  };
  PP.parseArgs = function (calleeKey) {
    this.expect('('); var pos = [], named = {}, hasNamed = false, outs = [];
    while (!this.is(')')) {
      if (this.peek().t === 'id' && this.is(':', 1) && !this.is('::', 1)) { var nm = this.next().v; this.next(); if (this.is('ref') || this.is('out')) this.next(); named[nm] = this.parseExpr(); hasNamed = true; }
      else if (this.is('out') || this.is('ref')) {
        var kind = this.next().v;
        if (this.is('var') || (this.peek().t === 'id' && (this.peek(1).t === 'id' || this.is('?', 1) || this.is('<', 1) || this.is('[', 1) || this.is('.', 1)))) { var os = this.i; this.tryType(); if (!(this.peek().t === 'id' && !RESERVED[this.peek().v])) this.i = os; }
        var vn = this.ident(); if (this.is('.') || this.is('[')) this.fail('out com membro não suportado');
        if (this.peek().v === '_' ) {}
        if (!this.isLocal(vn) && !(this.cls && (this.cls.members.inst[vn] || this.cls.members.stat[vn]))) { this.declare(vn); if (this.hoist) this.hoist[vn] = 1; }
        outs.push(vn); pos.push('undefined');
      } else pos.push(this.parseExpr());
      if (!this.accept(',')) break;
    }
    this.expect(')');
    return { pos: pos, named: named, hasNamed: hasNamed, outs: outs };
  };
  var KWTYPES = { int: 1, string: 1, long: 1, double: 1, float: 1, bool: 1, char: 1, object: 1, byte: 1, short: 1, uint: 1, ulong: 1, decimal: 1 };
  PP.refName = function (n) { // como emitir uma variável
    if (KWTYPES[n]) return TYPEMAP[n] || n;
    if (this.isLocal(n)) return n;
    if (this.cls) { if (this.cls.members.stat[n]) return this.cls.name + '.' + n; if (this.cls.members.inst[n]) return 'this.' + n; }
    return TYPEMAP[n] || n;
  };
  PP.isMemberCall = function (n) { return !KWTYPES[n] && !this.isLocal(n) && this.cls && (this.cls.members.inst[n] || this.cls.members.stat[n]); };
  PP.emitCall = function (callee, args, userKey) {
    var pos = args.pos;
    if (args.hasNamed) {
      var nk = Object.keys(args.named), npos = pos.length;
      var pick = function (L) { if (!L) return null; var best = null; for (var q = 0; q < L.length; q++) { var okk = nk.every(function (k) { return L[q].indexOf(k) >= 0; }); if (okk && L[q].length >= npos) return L[q]; if (okk && !best) best = L[q]; } return best; };
      var sig = userKey && pick(this.sigs[userKey]);
      var dropNamed = false;
      var bm = /^(?:this\.)?Bot\.(.+)$/.exec(callee);
      if (!sig && bm) {
        var BS = { 'Map.Jump': ['cell', 'pad', 'autoCorrect', 'clientOnly'], 'Map.Join': ['map', 'cell', 'pad', 'ignoreCheck', 'autoCorrect'], 'Player.WalkTo': ['x', 'y', 'speed'], 'Send.ClientPacket': ['packet', 'type'], 'Log': ['message'] };
        var bsig = BS[bm[1]];
        if (bsig && nk.every(function (k) { return bsig.indexOf(k) >= 0; })) sig = bsig;
        else { dropNamed = true; }
      }
      if (!sig && !bm) { var mm2 = /([A-Za-z_]\w*)$/.exec(callee); if (mm2) { sig = pick(GSIGS[mm2[1]]); if (!sig) this.unres.push(mm2[1]); } }
      if (sig) { var out = pos.slice(); Object.keys(args.named).forEach(function (k) { var ix = sig.indexOf(k); if (ix < 0) ix = out.length; while (out.length < ix) out.push('undefined'); out[ix] = args.named[k]; }); pos = out; }
      else if (!dropNamed) { var parts = Object.keys(args.named).map(function (k) { return k + ': ' + args.named[k]; }); pos = pos.concat(['{__named: true, ' + parts.join(', ') + '}']); }
    }
    var call = callee + '(' + pos.join(', ') + ')';
    var res = this.asyncOk ? '(await ' + call + ')' : call;
    if (args.outs.length) {
      var t = this.tmp(), o = args.outs;
      if (/\.TryParse$/.test(callee)) return '((' + t + ' = ' + call + '), (' + o[0] + ' = ' + t + '), !Number.isNaN(' + t + '))';
      var tail = o.length > 1 ? o.map(function (v, i) { return v + ' = (' + t + ' && ' + t + '[' + i + '])'; }).join(', ') : o[0] + ' = ' + t;
      return '((' + t + ' = ' + res + '), ' + tail + ', ' + t + ' != null && ' + t + ' !== false)';
    }
    return res;
  };
  PP.parsePrimary = function () {
    var x = this.peek();
    if (x.t === 'id' && x.v === 'throw') { this.next(); var te = this.parseExpr(); return '__throw(' + te + ')'; }
    switch (x.t) {
      case 'num': this.next(); return x.v;
      case 'str': this.next(); return x.chr ? JSON.stringify(x.v) : JSON.stringify(x.v);
      case 'istr': {
        this.next(); var self = this, out = '`';
        x.v.forEach(function (p) {
          if (p.s !== undefined) out += p.s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
          else {
            var sub = new Parser(tokenize(p.e), self.sigs, self.opts);
            sub.scopes = self.scopes; sub.cls = self.cls; sub.asyncOk = self.asyncOk; sub.hoist = self.hoist; sub.tmpN = self.tmpN + 500; sub.catchVar = self.catchVar;
            var ex = sub.parseExpr(); self.tmpN = Math.max(self.tmpN, sub.tmpN - 500);
            out += '${' + (p.fmt ? '__fmt(' + ex + ', ' + JSON.stringify(p.fmt) + ')' : '__str(' + ex + ')') + '}';
          }
        });
        return out + '`';
      }
      case 'op': {
        if (x.v === '(') {
          if (this.isLambdaAhead()) return this.parseLambda(false);
          if (this.peek(1).t === 'id' && this.is(':', 2) && !this.is('::', 2)) {
            this.next(); var tvals = [], tnm = [];
            while (true) {
              if (this.peek().t === 'id' && this.is(':', 1)) { tnm.push(this.next().v); this.next(); } else tnm.push(null);
              tvals.push(this.parseExpr()); if (!this.accept(',')) break;
            }
            this.expect(')'); return '__ntup([' + tvals.join(', ') + '], ' + JSON.stringify(tnm) + ')';
          }
          this.next(); var e = this.parseExpr();
          if (this.is(',')) { var els = [e]; while (this.accept(',')) els.push(this.parseExpr()); this.expect(')'); return '[' + els.join(', ') + ']'; }
          this.expect(')'); return '(' + e + ')';
        }
        if (x.v === '{') return this.parseArrayLiteral();
        this.fail('expressão inesperada');
      }
      case 'id': {
        var v = x.v;
        if (v === 'async' && (this.is('(', 1) || (this.peek(1).t === 'id' && this.is('=>', 2)) || this.is('delegate', 1))) { this.next(); return this.parseLambda(true); }
        if (this.is('=>', 1)) return this.parseLambda(false);
        switch (v) {
          case 'null': this.next(); return 'null';
          case 'true': this.next(); return 'true';
          case 'false': this.next(); return 'false';
          case 'this': this.next(); return 'this';
          case 'base': this.fail('"base" não suportado');
          case 'new': return this.parseNew();
          case 'default': { this.next(); if (this.accept('(')) { var ty = this.tryType(); this.expect(')'); return ty && PRIM[ty.name] && ty.name !== 'string' && ty.name !== 'object' ? (ty.name === 'bool' ? 'false' : '0') : 'null'; } return 'null'; }
          case 'typeof': { this.next(); this.expect('('); var t2 = this.tryType(); this.expect(')'); return JSON.stringify(t2 ? t2.name : ''); }
          case 'nameof': { this.next(); this.expect('('); var nn = this.ident(); while (this.accept('.')) nn = this.ident(); this.expect(')'); return JSON.stringify(nn); }
          case 'sizeof': this.fail('sizeof não suportado');
          case 'delegate': this.fail('delegate anônimo não suportado (use lambda)');
        }
        if (RESERVED[v] && !PRIM[v]) this.fail('palavra reservada "' + v + '"');
        this.next();
        // tipos genéricos em chamada:  Foo<int>(x)
        if (this.is('<')) { var s = this.i; this.next(); var ok = true; while (true) { if (!this._type()) { ok = false; break; } if (!this.accept(',')) break; } if (ok && (this.is('>') || this.is('>>')) && !this.is('>>')) { this.next(); if (!this.is('(') && !this.is('.')) ok = false; } else ok = false; if (!ok) this.i = s; }
        if (this.is('(')) {
          var memb = this.isMemberCall(v);
          var args = this.parseArgs();
          var callee = memb ? this.refName(v) : (TYPEMAP[v] || v);
          var key = memb ? (this.cls.members.stat[v] ? this.cls.name + '.' + v : v) : null;
          return this.emitCall(callee, args, key);
        }
        return this.refName(v);
      }
    }
    this.fail('expressão inesperada');
  };
  PP.isLambdaAhead = function () {
    var d = 0, j = this.i;
    for (; j < this.t.length; j++) { var t = this.t[j]; if (t.t === 'op') { if (t.v === '(') d++; else if (t.v === ')') { d--; if (d === 0) break; } } }
    var nx = this.t[j + 1]; return !!nx && nx.t === 'op' && nx.v === '=>';
  };
  PP.parseLambda = function (isAsync) {
    var names = [], js = [];
    if (this.accept('delegate')) this.fail('delegate não suportado');
    if (this.is('(')) {
      this.next();
      while (!this.is(')')) { var s = this.i, ty = this.tryType(); if (ty && this.peek().t === 'id' && !this.is('=>')) { /* tipo explícito */ } else this.i = s; var n = this.ident(); names.push(n); js.push(n); if (!this.accept(',')) break; }
      this.expect(')');
    } else { var nm = this.ident(); names.push(nm); js.push(nm); }
    this.expect('=>');
    var sv = this.snapshotFn({ names: names }, isAsync);
    var body, res;
    if (this.is('{')) { body = this.parseBlock(true); res = '(' + js.join(', ') + ') => { ' + this.finishFn(sv, body) + ' }'; }
    else { var e = this.parseExpr(); var hd = this.finishFnExpr(sv); res = hd ? '(' + js.join(', ') + ') => { ' + hd + ' return ' + e + '; }' : '(' + js.join(', ') + ') => ' + (e.charAt(0) === '{' ? '(' + e + ')' : e); }
    return (isAsync ? 'async ' : '') + res;
  };
  PP.parseArrayLiteral = function () {
    this.expect('{'); var items = [];
    while (!this.is('}')) { items.push(this.is('{') ? this.parseArrayLiteral() : this.parseExpr()); if (!this.accept(',')) break; }
    this.expect('}'); return '[' + items.join(', ') + ']';
  };
  PP.parseNew = function () {
    this.next();
    if (this.is('{')) { // tipo anônimo
      this.next(); var props = [];
      while (!this.is('}')) { if (this.peek().t === 'id' && this.is('=', 1)) { var n = this.ident(); this.next(); props.push(n + ': ' + this.parseExpr()); } else { var pe = this.parseExpr(); var pn = (/([A-Za-z_]\w*)\)*$/.exec(pe) || [0, 'p' + props.length])[1]; props.push(pn + ': ' + pe); } if (!this.accept(',')) break; }
      this.expect('}'); return '({' + props.join(', ') + '})';
    }
    if (this.is('[')) { this.next(); this.expect(']'); return this.parseArrayLiteral(); }
    if (this.is('(') && !this.is(')', 1) && this.peek(1).t === 'id') { var tsv = this.i; var tty = this._type(); if (tty && tty.tnames) { return this.is('{') ? this.parseArrayLiteral() : '[]'; } this.i = tsv; }
    var ty = this.is('(') ? { name: (this.lastType && this.lastType !== 'var' && this.lastType !== 'Tuple') ? this.lastType : 'List' } : this.tryTypeNew(); if (!ty) this.fail('tipo esperado após "new"');
    var base = ty.name.replace(/<.*$/, '');
    if (ty.arrayLen !== undefined) { // new T[n]  ou new T[]{...}
      if (ty.arrayLen === null) return this.is('{') ? this.parseArrayLiteral() : '[]';
      return '__newArray(' + ty.arrayLen + ')';
    }
    var args = this.is('(') ? this.parseArgs() : { pos: [], named: {}, hasNamed: false, outs: [] };
    var isDict = /^(Dictionary|SortedDictionary|ConcurrentDictionary)$/.test(base);
    var cls = isDict ? 'CsDict' : /^(List|IEnumerable|Queue|Stack|LinkedList|ConcurrentBag|SynchronizedList)$/.test(base) ? 'CsList' : /^HashSet$/.test(base) ? 'CsHashSet' : base === 'Exception' || /Exception$/.test(base) ? 'CsException' : base === 'Random' ? 'CsRandom' : base === 'Stopwatch' ? 'CsStopwatch' : base === 'StringBuilder' ? 'CsStringBuilder' : base === 'Option' ? 'CsOption' : (TYPEMAP[base] || base);
    var ctor = 'new ' + cls + '(' + args.pos.join(', ') + ')';
    if (args.hasNamed) ctor = 'new ' + cls + '(' + args.pos.concat(Object.keys(args.named).map(function (k) { return args.named[k]; })).join(', ') + ')';
    if (this.is('{')) { // inicializador de objeto/coleção
      this.next();
      if (isDict) {
        var ents = [];
        while (!this.is('}')) {
          if (this.accept('[')) { var k = this.parseExpr(); this.expect(']'); this.expect('='); ents.push('[' + k + ', ' + this.parseExpr() + ']'); }
          else { this.expect('{'); var k2 = this.parseExpr(); this.expect(','); var v2 = this.parseExpr(); this.expect('}'); ents.push('[' + k2 + ', ' + v2 + ']'); }
          if (!this.accept(',')) break;
        }
        this.expect('}'); return 'CsDict.from([' + ents.join(', ') + '])';
      }
      var first = this.peek(), isObj = first.t === 'id' && this.is('=', 1);
      if (isObj) {
        var sets = [];
        while (!this.is('}')) { var pn = this.ident(); this.expect('='); sets.push(pn + ': ' + (this.is('{') ? this.parseArrayLiteral() : this.parseExpr())); if (!this.accept(',')) break; }
        this.expect('}'); return 'Object.assign(' + ctor + ', {' + sets.join(', ') + '})';
      }
      var items = [];
      while (!this.is('}')) { items.push(this.is('{') ? this.parseArrayLiteral() : this.parseExpr()); if (!this.accept(',')) break; }
      this.expect('}');
      return cls === 'CsHashSet' ? 'new CsHashSet([' + items.join(', ') + '])' : '[' + items.join(', ') + ']';
    }
    if (cls === 'CsList') return args.pos.length ? 'Array.from(' + args.pos[0] + ')' : '[]';
    return ctor;
  };
  PP.tryTypeNew = function () { // tipo após new, com [n] possível
    var x = this.peek(); if (x.t !== 'id') return null;
    var name = this.next().v;
    while (this.is('.') && this.peek(1).t === 'id') { this.next(); name += '.' + this.next().v; }
    if (this.is('<')) { this.next(); var d = 1; while (d > 0 && this.peek().t !== 'eof') { var t = this.next(); if (t.v === '<') d++; else if (t.v === '>') d--; else if (t.v === '>>') d -= 2; } }
    if (this.is('[')) {
      this.next();
      if (this.is(']')) { this.next(); while (this.is('[')) { this.next(); this.expect(']'); } return { name: name, arrayLen: null }; }
      var n = this.parseExpr(); this.expect(']'); return { name: name, arrayLen: n };
    }
    return { name: name };
  };
  var MEMBERMAP = { Length: 'length' };
  PP.parsePostfix = function (e) {
    while (true) {
      var x = this.peek();
      if (x.t !== 'op') break;
      if (x.v === '.' || x.v === '?.') {
        this.next(); var q = x.v === '?.' ? '?.' : '.';
        if (q === '?.' && this.is('[')) {
          this.next();
          if (this.is('..') || this.is('^') || (this.peek().t === 'num' && this.is('..', 1)) || (this.peek().t === 'id' && this.is('..', 1)) || this.rangeAhead()) {
            var ra = 'undefined', rb = 'undefined';
            if (!this.is('..')) { if (this.accept('^')) ra = '-(' + this.parseUnaryOnly() + ')'; else ra = this.parseUnaryOnly(); }
            this.expect('..');
            if (!this.is(']')) { if (this.accept('^')) rb = '-(' + this.parseUnaryOnly() + ')'; else rb = this.parseUnaryOnly(); }
            this.expect(']'); e = '(' + e + ' == null ? null : __slice(' + e + ', ' + ra + ', ' + rb + '))'; continue;
          }
          var ix = this.parseExpr(); this.expect(']'); e = e + '?.[' + ix + ']'; continue;
        }
        var nm = this.ident();
        if (this.is('<')) { var s = this.i; this.next(); var ok = true; while (true) { if (!this._type()) { ok = false; break; } if (!this.accept(',')) break; } if (ok && this.is('>') ) { this.next(); if (!this.is('(')) ok = false; } else ok = false; if (!ok) this.i = s; }
        if (this.is('(')) {
          var args = this.parseArgs();
          var callee = e + q + nm;
          e = this.emitCall(callee, args, null);
          if (q === '?.') { e = e; }
        } else {
          var tix = this.tupNames && this.tupNames[e] ? this.tupNames[e].indexOf(nm) : -1;
          e = tix >= 0 ? e + (q === '?.' ? '?.' : '') + '[' + tix + ']' : e + q + (nm === 'Count' ? 'length' : (MEMBERMAP[nm] || nm));
        }
        continue;
      }
      if (x.v === '!' ) { this.next(); continue; }
      if (x.v === '[') {
        this.next();
        if (this.is('^') && !this.rangeAhead()) { var sv0 = this.i; this.next(); var hn = this.parseUnaryOnly(); if (this.is(']')) { this.next(); e = '__at(' + e + ', ' + hn + ')'; continue; } this.i = sv0; }
        if (this.is('..') || this.is('^') || (this.peek().t === 'num' && this.is('..', 1)) || (this.peek().t === 'id' && this.is('..', 1)) || this.rangeAhead()) {
          var ra = 'undefined', rb = 'undefined';
          if (!this.is('..')) { if (this.accept('^')) ra = '-(' + this.parseUnaryOnly() + ')'; else ra = this.parseUnaryOnly(); }
          this.expect('..');
          if (!this.is(']')) { if (this.accept('^')) rb = '-(' + this.parseUnaryOnly() + ')'; else rb = this.parseUnaryOnly(); }
          this.expect(']'); e = '__slice(' + e + ', ' + ra + ', ' + rb + ')'; continue;
        }
        var i2 = this.parseExpr(); this.expect(']'); e = e + '[' + i2 + ']'; continue;
      }
      if (x.v === '(') { var a2 = this.parseArgs(); e = this.emitCall(e, a2, null); continue; }
      if (x.v === '++' || x.v === '--') { this.next(); e = '(' + e + x.v + ')'; continue; }
      if (x.v === '!' ) { var nx = this.peek(1); if (nx.t === 'op' && /^(\.|\)|;|,|\]|\?|:|\}|&&|\|\||==|!=|=)$/.test(nx.v) && !(nx.v === '=')) { this.next(); continue; } }
      break;
    }
    return e;
  };

  // =============================== TRANSPILE ===============================
  var GSIGS = Object.create(null);
  function transpile(src) {
    var directives = [];
    var sigs = {}, collect = [];
    var p1 = new Parser(tokenize(src, directives), {}, { collectClasses: collect });
    p1.parseUnit(); sigs = p1.sigLists;
    Object.keys(p1.sigLists).forEach(function (k) { var nm = k.split('.').pop(); var L = GSIGS[nm] = GSIGS[nm] || []; p1.sigLists[k].forEach(function (names) { if (!L.some(function (x) { return x.join(',') === names.join(','); })) L.push(names); }); });
    var collect2 = [];
    var p2 = new Parser(tokenize(src, []), sigs, { collectClasses: collect2, ovl: p1.ovlCount });
    var js = p2.parseUnit();
    var entry = null;
    // classe que tem ScriptMain
    var re = /class (\w+) \{[\s\S]*?async ScriptMain\(/g, m, last = null;
    while ((m = re.exec(js))) last = m[1];
    var scriptClass = null;
    collect2.forEach(function (c) { if (c.members.inst.ScriptMain) scriptClass = c.name; });
    var includes = [];
    directives.forEach(function (d) { var mm = /^\/\/cs_include\s+(.+)$/.exec(d); if (mm) includes.push(mm[1].trim()); });
    return { js: js, scriptClass: scriptClass, includes: includes, directives: directives, unres: p2.unres, src: src };
  }

  // =============================== RUNTIME ===============================
  function def(proto, name, fn) { if (!Object.prototype.hasOwnProperty.call(proto, name)) Object.defineProperty(proto, name, { value: fn, writable: true, configurable: true, enumerable: false }); }
  function ci(cmp) { return typeof cmp === 'string' && /IgnoreCase/.test(cmp); }
  function lcs(s) { return String(s).toLowerCase(); }
  var AP = Array.prototype, SP = String.prototype;
  function fnOf(f) { return typeof f === 'function' ? f : function (x) { return x === f; }; }
  def(AP, 'Add', function (x) { this.push(x); });
  ['Item1', 'Item2', 'Item3', 'Item4', 'Item5'].forEach(function (k, ix) { if (!Object.prototype.hasOwnProperty.call(AP, k)) Object.defineProperty(AP, k, { get: function () { return this[ix]; }, set: function (v) { this[ix] = v; }, configurable: true }); });
  def(AP, 'AddRange', function (l) { for (var i = 0, a = Array.from(l); i < a.length; i++) this.push(a[i]); });
  def(AP, 'Remove', function (x) { var i = this.indexOf(x); if (i < 0) return false; this.splice(i, 1); return true; });
  def(AP, 'RemoveAt', function (i) { this.splice(i, 1); });
  def(AP, 'RemoveAll', function (f) { var n = 0; for (var i = this.length - 1; i >= 0; i--) if (f(this[i])) { this.splice(i, 1); n++; } return n; });
  def(AP, 'Insert', function (i, x) { this.splice(i, 0, x); });
  def(AP, 'Clear', function () { this.length = 0; });
  def(AP, 'Contains', function (x, cmp) { if (ci(cmp) || (typeof x === 'string' && cmp)) { var l = lcs(x); return this.some(function (y) { return lcs(y) === l; }); } return this.indexOf(x) > -1; });
  def(AP, 'Any', function (f) { return f ? this.some(f) : this.length > 0; });
  def(AP, 'All', function (f) { return this.every(f); });
  def(AP, 'Concat', function (o) { return this.concat(Array.from(o || [])); });
  def(AP, 'Where', function (f) { return this.filter(function (x, i) { return f(x, i); }); });
  def(AP, 'Select', function (f) { return this.map(function (x, i) { return f(x, i); }); });
  def(AP, 'SelectMany', function (f) { var o = []; this.forEach(function (x) { Array.from(f(x)).forEach(function (y) { o.push(y); }); }); return o; });
  def(AP, 'First', function (f) { var r = f ? this.filter(f)[0] : this[0]; if (r === undefined) throw new Error('Sequence contains no matching element'); return r; });
  def(AP, 'FirstOrDefault', function (f) { var r = f ? this.filter(f)[0] : this[0]; return r === undefined ? null : r; });
  def(AP, 'Last', function (f) { var l = f ? this.filter(f) : this; if (!l.length) throw new Error('Sequence contains no matching element'); return l[l.length - 1]; });
  def(AP, 'LastOrDefault', function (f) { var l = f ? this.filter(f) : this; return l.length ? l[l.length - 1] : null; });
  def(AP, 'Single', function (f) { var l = f ? this.filter(f) : this; if (l.length !== 1) throw new Error('Sequence does not contain exactly one element'); return l[0]; });
  def(AP, 'SingleOrDefault', function (f) { var l = f ? this.filter(f) : this; return l.length === 1 ? l[0] : null; });
  def(AP, 'Find', function (f) { var r = this.filter(f)[0]; return r === undefined ? null : r; });
  def(AP, 'FindAll', function (f) { return this.filter(f); });
  def(AP, 'Exists', function (f) { return this.some(f); });
  def(AP, 'TrueForAll', function (f) { return this.every(f); });
  def(AP, 'ToList', function () { return Array.from(this); });
  def(AP, 'ToHashSet', function (cmp) { var ic = cmp && cmp.ic; var seen = {}; var out = []; Array.from(this).forEach(function (x) { var k = ic && typeof x === 'string' ? x.toLowerCase() : x; if (ic) { if (seen[k]) return; seen[k] = 1; out.push(x); } else if (out.indexOf(x) < 0) out.push(x); }); return new CsHashSet(out); });
  def(AP, 'ToArray', function () { return Array.from(this); });
  def(AP, 'Count', function (f) { return f ? this.filter(f).length : this.length; });
  def(AP, 'Sum', function (f) { return this.reduce(function (s, x) { return s + (f ? f(x) : x); }, 0); });
  def(AP, 'Max', function (f) { return Math.max.apply(null, f ? this.map(f) : this); });
  def(AP, 'Min', function (f) { return Math.min.apply(null, f ? this.map(f) : this); });
  def(AP, 'Average', function (f) { return this.length ? this.Sum(f) / this.length : 0; });
  function cmpv(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  def(AP, 'OrderBy', function (f) { return Array.from(this).sort(function (a, b) { return cmpv(f ? f(a) : a, f ? f(b) : b); }); });
  def(AP, 'OrderByDescending', function (f) { return Array.from(this).sort(function (a, b) { return cmpv(f ? f(b) : b, f ? f(a) : a); }); });
  def(AP, 'Sort', function (f) { return this.sort(f || cmpv); });
  def(AP, 'Distinct', function () { return Array.from(new Set(this)); });
  def(AP, 'Skip', function (n) { return this.slice(n); });
  def(AP, 'Take', function (n) { return this.slice(0, n); });
  def(AP, 'Except', function (l) { var s = Array.from(l); return this.filter(function (x) { return s.indexOf(x) < 0; }); });
  def(AP, 'Union', function (l) { return Array.from(new Set(this.concat(Array.from(l)))); });
  def(AP, 'Intersect', function (l) { var s = Array.from(l); return this.filter(function (x) { return s.indexOf(x) > -1; }); });
  def(AP, 'ForEach', function (f) { this.forEach(function (x) { f(x); }); });
  def(AP, 'ElementAt', function (i) { return this[i]; });
  def(AP, 'GetRange', function (i, n) { return this.slice(i, i + n); });
  def(AP, 'ToDictionary', function (kf, vf) { var d = new CsDict(); this.forEach(function (x) { d.Add(kf(x), vf ? vf(x) : x); }); return d; });
  def(AP, 'Cast', function () { return this; });
  def(AP, 'OfType', function () { return this; });
  def(AP, 'SequenceEqual', function (l) { l = Array.from(l); return l.length === this.length && this.every(function (x, i) { return x === l[i]; }); });
  def(AP, 'Enqueue', function (x) { this.push(x); }); def(AP, 'Dequeue', function () { return this.shift(); });
  def(AP, 'Push', function (x) { this.push(x); }); def(AP, 'Pop', function () { return this.pop(); }); def(AP, 'Peek', function () { return this[this.length - 1]; });
  def(AP, 'GroupBy', function (f) { var m = new Map(); this.forEach(function (x) { var k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return Array.from(m, function (e) { var g = e[1]; g.Key = e[0]; return g; }); });
  def(SP, 'Contains', function (s, cmp) { return ci(cmp) ? lcs(this).indexOf(lcs(s)) > -1 : this.indexOf(s) > -1; });
  def(SP, 'StartsWith', function (s, cmp) { return ci(cmp) ? lcs(this).indexOf(lcs(s)) === 0 : this.indexOf(s) === 0; });
  def(SP, 'EndsWith', function (s, cmp) { return ci(cmp) ? lcs(this).slice(-String(s).length) === lcs(s) : this.slice(-String(s).length) === String(s) || s === ''; });
  def(SP, 'ToLower', function () { return this.toLowerCase(); }); def(SP, 'ToUpper', function () { return this.toUpperCase(); });
  def(SP, 'ToLowerInvariant', function () { return this.toLowerCase(); }); def(SP, 'ToUpperInvariant', function () { return this.toUpperCase(); });
  def(SP, 'Trim', function () { return this.trim(); }); def(SP, 'TrimStart', function () { return this.trimStart(); }); def(SP, 'TrimEnd', function () { return this.trimEnd(); });
  def(SP, 'Substring', function (a, n) { return n === undefined ? this.substring(a) : this.substr(a, n); });
  def(SP, 'AsSpan', function (a, n) { return a === undefined ? String(this) : (n === undefined ? this.substring(a) : this.substr(a, n)); });
  def(SP, 'AsMemory', function (a, n) { return a === undefined ? String(this) : (n === undefined ? this.substring(a) : this.substr(a, n)); });
  def(SP, 'IndexOf', function (s, a, cmp) { return this.indexOf(s, typeof a === 'number' ? a : 0); });
  def(SP, 'Replace', function (a, b) { return this.split(a).join(b); });
  def(SP, 'Split', function (sep) { var seps = [].concat(sep && sep.__named ? [] : sep).filter(function (x) { return typeof x === 'string'; }); var a = [String(this)]; seps.forEach(function (s) { a = [].concat.apply([], a.map(function (p) { return p.split(s); })); }); return seps.length ? a : String(this).split(/\s+/); });
  def(SP, 'PadLeft', function (n, c) { return this.padStart(n, c || ' '); }); def(SP, 'PadRight', function (n, c) { return this.padEnd(n, c || ' '); });
  def(SP, 'Insert', function (i, s) { return this.slice(0, i) + s + this.slice(i); }); def(SP, 'Remove', function (i, n) { return n === undefined ? this.slice(0, i) : this.slice(0, i) + this.slice(i + n); });
  def(SP, 'Equals', function (s, cmp) { return ci(cmp) ? lcs(this) === lcs(s) : String(this) === String(s); });
  def(SP, 'CompareTo', function (s) { return cmpv(String(this), String(s)); });
  def(SP, 'ToCharArray', function () { return Array.from(this); });
  def(SP, 'LastIndexOf', function (s) { return this.lastIndexOf(s); });
  def(Object.prototype, 'ToString', function () { return String(this); });
  def(Object.prototype, 'Equals', function (o) { return this === o || String(this) === String(o); });
  def(Object.prototype, 'GetHashCode', function () { return 0; });
  def(Number.prototype, 'ToString', function (f) { return f ? __fmt(Number(this), f) : String(this); });

  function CsDict() { var self = new Proxy(this, { get: function (t, k) { if (k in t) { var v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } if (typeof k === 'symbol') return undefined; return t.m.get(k); }, set: function (t, k, v) { if (k === 'm') { t[k] = v; return true; } t.m.set(k, v); return true; } }); this.m = new Map(); return self; }
  CsDict.from = function (e) { var d = new CsDict(); e.forEach(function (x) { d.m.set(x[0], x[1]); }); return d; };
  CsDict.prototype.Add = function (k, v) { if (this.m.has(k)) throw new Error('duplicate key ' + k); this.m.set(k, v); };
  CsDict.prototype.ContainsKey = function (k) { return this.m.has(k); };
  CsDict.prototype.ContainsValue = function (v) { return Array.from(this.m.values()).indexOf(v) > -1; };
  CsDict.prototype.Remove = function (k) { return this.m.delete(k); };
  CsDict.prototype.Clear = function () { this.m.clear(); };
  CsDict.prototype.TryGetValue = function (k) { return this.m.has(k) ? [this.m.get(k)] : null; };
  CsDict.prototype.GetValueOrDefault = function (k, d) { return this.m.has(k) ? this.m.get(k) : (d === undefined ? null : d); };
  Object.defineProperty(CsDict.prototype, 'Keys', { get: function () { return Array.from(this.m.keys()); } });
  Object.defineProperty(CsDict.prototype, 'Values', { get: function () { return Array.from(this.m.values()); } });
  Object.defineProperty(CsDict.prototype, 'length', { get: function () { return this.m.size; } });
  Object.defineProperty(CsDict.prototype, 'Count', { get: function () { return this.m.size; } });
  CsDict.prototype[Symbol.iterator] = function () { var it = this.m.entries(); return { next: function () { var n = it.next(); return n.done ? n : { done: false, value: { Key: n.value[0], Value: n.value[1] } }; } }; };
  function CsHashSet(init) { var a = []; Object.setPrototypeOf(a, CsHashSet.prototype); (init ? Array.from(init) : []).forEach(function (x) { if (a.indexOf(x) < 0) a.push(x); }); return a; }
  CsHashSet.prototype = Object.create(Array.prototype); CsHashSet.prototype.Add = function (x) { if (this.indexOf(x) < 0) { this.push(x); return true; } return false; };
  function CsException(m) { var e = new Error(m); return e; }
  ['Message', 'StackTrace', 'Source'].forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(Error.prototype, k)) Object.defineProperty(Error.prototype, k, { get: function () { return k === 'Message' ? this.message : k === 'StackTrace' ? (this.stack || '') : ''; }, configurable: true }); });
  if (!Error.prototype.ToString) Object.defineProperty(Error.prototype, 'ToString', { value: function () { return String(this.message); }, configurable: true, writable: true });
  function CsOption(name, display, tip, def) { var o = { Name: name, Display: display, Tooltip: tip, Default: def }; try { if (W.Bot && !(name in W.Bot.Config.data)) W.Bot.Config.data[name] = def; } catch (e) { } return o; }
  function CsRandom() { } CsRandom.prototype.Next = function (a, b) { if (b === undefined) { b = a === undefined ? 2147483647 : a; a = 0; } return a + Math.floor(Math.random() * (b - a)); }; CsRandom.prototype.NextDouble = function () { return Math.random(); };
  function CsStopwatch() { this.t = 0; this.s = 0; } CsStopwatch.StartNew = function () { var w = new CsStopwatch(); w.Start(); return w; };
  CsStopwatch.prototype.Start = function () { this.s = Date.now(); }; CsStopwatch.prototype.Stop = function () { this.t += Date.now() - this.s; this.s = 0; }; CsStopwatch.prototype.Restart = function () { this.t = 0; this.s = Date.now(); };
  Object.defineProperty(CsStopwatch.prototype, 'ElapsedMilliseconds', { get: function () { return this.t + (this.s ? Date.now() - this.s : 0); } });
  function CsStringBuilder(s) { this.s = typeof s === 'string' ? s : ''; /* new StringBuilder(int capacity) não é texto */ } CsStringBuilder.prototype.Append = function (x) { this.s += __str(x); return this; }; CsStringBuilder.prototype.AppendLine = function (x) { this.s += (x === undefined ? '' : __str(x)) + '\n'; return this; }; CsStringBuilder.prototype.ToString = function () { return this.s; }; CsStringBuilder.prototype.toString = CsStringBuilder.prototype.ToString;
  Object.defineProperty(CsStringBuilder.prototype, 'Length', { get: function () { return this.s.length; } }); Object.defineProperty(CsStringBuilder.prototype, 'length', { get: function () { return this.s.length; } });
  function __str(x) { return x === null || x === undefined ? '' : (x === true ? 'True' : x === false ? 'False' : String(x)); }
  function __fmt(v, f) {
    var m = /^([NnDdFfXxPp])(\d*)$/.exec(f); if (!m || typeof v !== 'number') return __str(v);
    var k = m[1].toUpperCase(), n = m[2] === '' ? (k === 'D' ? 0 : 2) : +m[2];
    if (k === 'N') return v.toLocaleString('en-US', { minimumFractionDigits: n, maximumFractionDigits: n });
    if (k === 'F') return v.toFixed(n); if (k === 'D') return String(Math.trunc(v)).padStart(n, '0'); if (k === 'X') return v.toString(16).toUpperCase().padStart(n, '0');
    return (v * 100).toFixed(n) + '%';
  }
  function __chr(x) { return typeof x === 'number' ? String.fromCharCode(x) : String(x); }
  function __newArray(n) { return new Array(n).fill(0); }
  // ---- sobrecargas: escolhe a assinatura pelos tipos reais dos argumentos (como o compilador C# faz) ----
  function ovlScore(v, ty) {
    var raw = String(ty).replace(/\s+/g, ''), nullable = /\?$/.test(raw) || /^Nullable</.test(raw), b = raw.replace(/\?$/, '');
    var isArr = /\[\]$/.test(b), gm = /^(?:List|IList|IEnumerable|ICollection|HashSet|IReadOnlyList|IReadOnlyCollection)<(.+)>$/.exec(b);
    var el = isArr ? b.replace(/\[\]$/, '') : (gm ? gm[1] : null);
    if (v === undefined) return 0;
    if (v === null) { if (/^(int|long|short|byte|uint|ulong|ushort|sbyte|double|float|decimal|bool|char|Int32|Int64)$/.test(b) && !nullable) return -1; return 1; }
    if (b === 'object' || b === 'dynamic' || /^[A-Z]$/.test(b)) return 1;
    if (el !== null) {
      if (!Array.isArray(v)) return /^string$/i.test(b) ? -1 : (typeof v === 'object' && v && typeof v[Symbol.iterator] === 'function' ? 2 : -1);
      if (v.length === 0) return 2;
      var e0 = v[0], ee = el.replace(/\?$/, '');
      if (/^(string|String)$/.test(ee)) return typeof e0 === 'string' ? 3 : -1;
      if (/^(int|long|short|byte|double|float|decimal|Int32|Int64|uint)$/.test(ee)) return typeof e0 === 'number' ? 3 : -1;
      if (/^(bool|Boolean)$/.test(ee)) return typeof e0 === 'boolean' ? 3 : -1;
      return typeof e0 === 'object' || typeof e0 === 'function' ? 2 : -1;
    }
    if (/^(string|String)$/.test(b)) return typeof v === 'string' ? 3 : -1;
    if (/^(char|Char)$/.test(b)) return typeof v === 'string' && v.length === 1 ? 3 : (typeof v === 'number' ? 1 : -1);
    if (/^(int|long|short|byte|uint|ulong|ushort|sbyte|Int32|Int64)$/.test(b)) return typeof v === 'number' ? (Number.isInteger(v) ? 3 : -1) : -1;
    if (/^(double|float|decimal|Double)$/.test(b)) return typeof v === 'number' ? (Number.isInteger(v) ? 2 : 3) : -1;
    if (/^(bool|Boolean)$/.test(b)) return typeof v === 'boolean' ? 3 : -1;
    if (/^(Func|Action|Predicate|Comparison|Delegate)/.test(b)) return typeof v === 'function' ? 3 : -1;
    if (typeof v === 'string' || typeof v === 'boolean') return -1;
    if (Array.isArray(v)) return /^(Array|IEnumerable|IList|ICollection|List)/.test(b) ? 2 : -1;
    if (typeof v === 'number') return 1; // enum
    return 2;
  }
  function ovlPick(tbl, a) {
    var eff = a.length; while (eff > 0 && a[eff - 1] === undefined) eff--;
    var best = null, bs = -Infinity;
    tbl.forEach(function (m) {
      var np = m.t.length, hasP = m.p.some(Boolean), req = 0, i;
      for (i = 0; i < np; i++) if (!m.o[i] && !m.p[i]) req++;
      if (eff < req) return;
      if (!hasP && eff > np) return;
      var sc = 0;
      for (i = 0; i < eff; i++) {
        var ti = i < np ? i : np - 1, ty = m.t[ti], v = a[i], s;
        if (m.p[ti]) { var et = String(ty).replace(/\[\]$/, ''); s = (i === ti && eff === np && Array.isArray(v) && ovlScore(v, ty) >= 0) ? 3 : ovlScore(v, et); }
        else s = ovlScore(v, ty);
        if (s < 0) return; sc += s;
      }
      sc = sc * 100 - np;
      if (sc > bs) { bs = sc; best = m; }
    });
    return best || tbl[tbl.length - 1];
  }
  function __is(x, t) { if (x === null || x === undefined) return false; var b = t.replace(/<.*$/, ''); if (/^(string|String)$/.test(b)) return typeof x === 'string'; if (/^(int|long|double|float|short|byte|decimal|Int32)$/.test(b)) return typeof x === 'number'; if (/^(bool|Boolean)$/.test(b)) return typeof x === 'boolean'; if (/^(List|IEnumerable|Array)$/.test(b)) return Array.isArray(x); var c = W[b]; return typeof c === 'function' ? x instanceof c : true; }
  var Sleep = function (ms) { return W.Bot.Sleep(ms); };
  var statics = {
    CsString: { Join: function (sep, a) { var l = (arguments.length > 2 || !Array.isArray(a)) ? [].slice.call(arguments, 1) : a; return Array.from(l).map(__str).join(sep); }, IsNullOrEmpty: function (s) { return s === null || s === undefined || s === ''; }, IsNullOrWhiteSpace: function (s) { return s === null || s === undefined || String(s).trim() === ''; }, Format: function (f) { var a = [].slice.call(arguments, 1); return String(f).replace(/\{(\d+)(?::([^}]*))?\}/g, function (_, i, fm) { return fm ? __fmt(a[i], fm) : __str(a[i]); }); }, Concat: function () { return [].slice.call(arguments).map(__str).join(''); }, Empty: '', Equals: function (a, b, c) { return ci(c) ? lcs(a) === lcs(b) : a === b; } },
    CsInt: { Parse: function (s) { var n = parseInt(s, 10); if (isNaN(n)) throw new Error('Input string was not in a correct format'); return n; }, TryParse: function (s) { return parseInt(s, 10); }, MaxValue: 2147483647, MinValue: -2147483648 },
    CsDouble: { Parse: function (s) { return parseFloat(s); }, TryParse: function (s) { return parseFloat(s); }, MaxValue: Number.MAX_VALUE, MinValue: -Number.MAX_VALUE },
    CsBool: { Parse: function (s) { return /^true$/i.test(s); } },
    CsChar: { IsDigit: function (c) { return /\d/.test(c); }, IsLetter: function (c) { return /[A-Za-z\u00C0-\u024F]/.test(c); }, IsUpper: function (c) { return c !== c.toLowerCase(); }, IsLower: function (c) { return c !== c.toUpperCase(); }, ToUpper: function (c) { return c.toUpperCase(); }, ToLower: function (c) { return c.toLowerCase(); }, IsWhiteSpace: function (c) { return /\s/.test(c); } },
    CsMath: { Max: Math.max, Min: Math.min, Abs: Math.abs, Floor: Math.floor, Ceiling: Math.ceil, Round: function (x, d) { return d ? Number(x.toFixed(d)) : Math.round(x); }, Sqrt: Math.sqrt, Pow: Math.pow, Truncate: Math.trunc, Sign: Math.sign, Log: Math.log, Log10: Math.log10, Sin: Math.sin, Cos: Math.cos, PI: Math.PI },
    CsConvert: { ToInt32: function (x) { return Math.trunc(Number(x)); }, ToInt64: function (x) { return Math.trunc(Number(x)); }, ToDouble: Number, ToString: __str, ToBoolean: function (x) { return typeof x === 'string' ? /^true$/i.test(x) : !!x; } },
    CsConsole: { WriteLine: function (x) { W.Bot.Log(__str(x)); }, Write: function (x) { W.Bot.Log(__str(x)); }, ReadLine: function () { return ''; } },
    CsThread: { Sleep: Sleep }, CsTask: { Delay: Sleep, Run: function (f) { return f(); }, CompletedTask: null },
    CsEnv: { get TickCount() { return Date.now() % 2147483647; }, NewLine: '\n' },
    CsDateTime: (function () {
      function D(y, m, d, h, mi, sec) { if (y === undefined) return new Date(); return new Date(y, (m || 1) - 1, d || 1, h || 0, mi || 0, sec || 0); }
      Object.defineProperty(D, 'Now', { get: function () { return new Date(); } });
      Object.defineProperty(D, 'UtcNow', { get: function () { return new Date(); } });
      Object.defineProperty(D, 'Today', { get: function () { var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); } });
      return D;
    })(),
    CsEnumerable: { Range: function (a, n) { var o = []; for (var i = 0; i < n; i++) o.push(a + i); return o; }, Repeat: function (x, n) { return new Array(n).fill(x); }, Empty: function () { return []; } },
    CsGuid: { NewGuid: function () { return Math.random().toString(16).slice(2); } }, CsTimeSpan: { FromSeconds: function (s) { return s * 1000; }, FromMilliseconds: function (s) { return s; }, FromMinutes: function (m) { return m * 60000; } },
    CsPath: { Combine: function () { return [].slice.call(arguments).join('/'); }, GetFileName: function (p) { return String(p).split('/').pop(); }, GetFullPath: function (p) { return String(p); }, GetDirectoryName: function (p) { var a = String(p).split('/'); a.pop(); return a.join('/'); }, GetExtension: function (p) { var m = /\.[^./]*$/.exec(String(p)); return m ? m[0] : ''; }, GetFileNameWithoutExtension: function (p) { return String(p).split('/').pop().replace(/\.[^.]*$/, ''); } },
    StringComparer: { OrdinalIgnoreCase: { ic: true }, InvariantCultureIgnoreCase: { ic: true }, CurrentCultureIgnoreCase: { ic: true }, Ordinal: { ic: false }, InvariantCulture: { ic: false }, CurrentCulture: { ic: false } },
    CsFile: (function () {
      var mem = {};
      function key(p) { return 'skua.file.' + String(p); }
      function rd(p) { if (p in mem) return mem[p]; try { var v = localStorage.getItem(key(p)); return v === null || v === undefined ? null : v; } catch (e) { return null; } }
      function wr(p, t) { mem[p] = String(t); try { localStorage.setItem(key(p), String(t)); } catch (e) {} }
      return {
        Exists: function (p) { return rd(p) !== null; },
        ReadAllText: function (p) { var v = rd(p); return v === null ? '' : v; },
        ReadAllLines: function (p) { var v = rd(p); return v === null ? [] : v.split(/\r?\n/); },
        ReadLines: function (p) { var v = rd(p); return v === null ? [] : v.split(/\r?\n/); },
        WriteAllText: function (p, t) { wr(p, t); },
        WriteAllLines: function (p, l) { wr(p, [].slice.call(l).join('\n')); },
        AppendAllText: function (p, t) { wr(p, (rd(p) || '') + t); },
        AppendAllLines: function (p, l) { wr(p, (rd(p) || '') + [].slice.call(l).join('\n') + '\n'); },
        AppendText: function (p) { return { WriteLine: function (t) { wr(p, (rd(p) || '') + (t === undefined ? '' : t) + '\n'); }, Write: function (t) { wr(p, (rd(p) || '') + t); }, Dispose: function () {}, Close: function () {}, Flush: function () {} }; },
        CreateDirectory: function () {}, GetFiles: function () { return []; }, GetDirectories: function () { return []; },
        Delete: function (p) { delete mem[p]; try { localStorage.removeItem(key(p)); } catch (e) {} },
        Copy: function () {}, Move: function () {}
      };
    })(), CsRegex: { IsMatch: function (s, r) { return new RegExp(r).test(s); }, Replace: function (s, r, t) { return String(s).replace(new RegExp(r, 'g'), t); } },
    CsInterlocked: { Increment: function (x) { return x + 1; } }
  };
  function enumProxy(name) { return new Proxy({}, { get: function (t, k) { return typeof k === 'string' ? k : undefined; } }); }

  // ---------- CoreBots (shim parcial, tentativa de compatibilidade) ----------
  function named(args) { var a = [].slice.call(args), o = {}; if (a.length && a[a.length - 1] && a[a.length - 1].__named) o = a.pop(); return { a: a, o: o }; }
  function listify(x) { return x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]; }
  var Core = {
    Instance: null,
    CBOList: [], loadedBank: false,
    get IsMember() { return W.Bot.Player.IsMember; },
    get PrivateRoomNumber() { return W.Bot.Options.PrivateNumber; },
    SetOptions: function () { var O = W.Bot.Options; O.SafeTimings = true; O.LagKiller = true; O.SkipCutscenes = true; O.RejectAllDrops = false; O.ExitCombatBeforeQuest = true; O.HidePlayers = true; O.PrivateRooms = false; },
    Logger: function (m) { var n = named(arguments); W.Bot.Log(__str(n.a[0])); },
    StopBot: function (m) { W.Bot.Log('Script parado: ' + __str(m)); throw new Error('__SKUA_STOP__'); },
    Sleep: Sleep, Rest: function () { return W.Bot.Player.Rest(); },
    Join: function (map, cell, pad) { var n = named(arguments); return W.Bot.Map.Join(n.a[0], n.a[1] || 'Enter', n.a[2] || 'Spawn', !!n.o.ignoreCheck); },
    Jump: function (cell, pad) { return W.Bot.Map.Jump(cell || 'Enter', pad || 'Spawn'); },
    JumpWait: function () { return W.Bot.Map.Jump(W.Bot.Player.Cell, W.Bot.Player.Pad); },
    EnsureAccept: async function () { var l = [].concat.apply([], [].slice.call(arguments)); for (var i = 0; i < l.length; i++) await W.Bot.Quests.EnsureAccept(l[i]); },
    EnsureComplete: function (id, item) { return W.Bot.Quests.EnsureComplete(id, item === undefined ? -1 : item); },
    EnsureLoad: async function () { var l = [].concat.apply([], [].slice.call(arguments)); for (var i = 0; i < l.length; i++) await W.Bot.Quests.EnsureLoad(l[i]); },
    RegisterQuests: function () { return W.Bot.Quests.RegisterQuests.apply(null, [].concat.apply([], [].slice.call(arguments))); },
    CancelRegisteredQuests: function () { return W.Bot.Quests.UnregisterAllQuests(); },
    AddDrop: function () { var l = [].concat.apply([], [].slice.call(arguments)).filter(function (x) { return !(x && x.__named); }); W.Bot.Drops.Add.apply(null, l); W.Bot.Drops.Start(); },
    RemoveDrop: function () { W.Bot.Drops.Clear(); },
    CheckInventory: function (item, qty) {
      var n = named(arguments), q = typeof n.a[1] === 'number' ? n.a[1] : 1, l = listify(n.a[0]);
      var toInv = n.a[2] === undefined ? true : n.a[2];
      return l.length > 0 && l.every(function (it) { return W.Bot.Inventory.Contains(it, q) || W.Bot.TempInv.Contains(it, q) || (!toInv && W.Bot.Bank.Contains(it, q)); });
    },
    CheckSpaces: function (n) { return W.Bot.Inventory.FreeSlots >= (n || 1); },
    ToBank: async function () { var l = [].concat.apply([], [].slice.call(arguments)).filter(function (x) { return typeof x === 'string' || typeof x === 'number'; }); for (var i = 0; i < l.length; i++) await W.Bot.Inventory.ToBank(l[i]); },
    Equip: function (it) { return W.Bot.Inventory.EquipItem(it); },
    EquipClass: function () { return null; },
    GetMapItem: async function (id, qty, map) { var n = named(arguments); if (n.a[2]) await Core.Join(n.a[2]); qty = n.a[1] || 1; for (var i = 0; i < qty; i++) { await W.Bot.Map.GetMapItem(n.a[0]); await Sleep(W.Bot.Options.ActionDelay); } },
    BuyItem: async function (map, shop, item, qty) { var n = named(arguments), a = n.a; if (a[0]) await Core.Join(a[0]); await W.Bot.Shops.Load(a[1]); var q = typeof a[3] === 'number' && a[3] > 0 ? a[3] : undefined; var have = W.Bot.Inventory.GetQuantity(a[2]); if (q !== undefined && have >= q) return; return W.Bot.Shops.BuyItem(a[2], q !== undefined ? q - have : undefined); },
    KillMonster: async function (map, cell, pad, monster, item, qty, isTemp) {
      var n = named(arguments), a = n.a, B = W.Bot; item = a[4] === undefined ? '*' : a[4]; qty = a[5] === undefined ? 1 : a[5]; isTemp = a[6] === undefined ? true : a[6];
      await Core.Join(a[0], a[1], a[2]); await B.Map.Jump(a[1], a[2]);
      B.Skills.Start && !B.Skills.active && B.Skills.Start('1 2 3 4', 250);
      if (item === '*') return B.Kill.Monster(a[3]);
      return B.Kill.ForItem(a[3], item, qty, isTemp);
    },
    HuntMonster: async function (map, monster, item, qty, isTemp) {
      var n = named(arguments), a = n.a, B = W.Bot; item = a[2] === undefined ? '*' : a[2]; qty = a[3] === undefined ? 1 : a[3]; isTemp = a[4] === undefined ? true : a[4];
      await Core.Join(a[0]);
      B.Skills.Start && !B.Skills.active && B.Skills.Start('1 2 3 4', 250);
      if (item === '*') return B.Hunt.Monster(a[1]);
      return B.Hunt.ForItem(a[1], item, qty, isTemp);
    },
    AttackMonster: function (m) { return W.Bot.Kill.Monster(m); },
    KillEscherion: nosupCore('KillEscherion'), KillVath: nosupCore('KillVath'), KillXiang: nosupCore('KillXiang')
  };
  function nosupCore(n) { return function () { throw new Error('Core.' + n + ' não existe neste shim do CoreBots'); }; }
  Core.Instance = Core;
  function missingShim(name) { // CoreFarms/CoreAdvanced/CoreStory/...: não portados
    var h = { get: function (t, k) { if (k === 'Instance') return p; if (typeof k !== 'string') return undefined; if (k in t) return t[k]; return function () { throw new Error(name + '.' + k + ' não está disponível: o CoreBots completo (' + name + ') não foi portado para o celular'); }; } };
    var p = new Proxy({}, h); return p;
  }
  var libs = {};
  ['CoreFarms', 'CoreAdvanced', 'CoreStory', 'CoreDailies', 'CoreAQW', 'CoreDrops', 'CoreSoulBlade', 'CoreDarkon', 'CoreNation', 'CoreBLOD', 'CoreSDKA', 'CoreHollowbORN', 'CoreHoliday', 'CoreArmyLite', 'CoreCnS', 'Army'].forEach(function (n) {
    var shim = missingShim(n); libs[n] = function () { return shim; }; libs[n].Instance = shim;
  });
  var iface = { Instance: null };

  function install() {
    var Bot = W.Bot; iface.Instance = Bot;
    if (!Array.Empty) Array.Empty = function () { return []; };
    W.__missing = W.__missing || {};
    Object.keys(statics).forEach(function (k) {
      var base = statics[k];
      W[k] = new Proxy(base, { get: function (t, m) { if (m in t || typeof m !== 'string' || m === 'then') return t[m]; W.__missing[k + '.' + m] = 1; return function () { return undefined; }; } });
    });
    W.CsList = Array; W.CsDict = CsDict; W.CsHashSet = CsHashSet; W.CsException = CsException; W.CsOption = CsOption; W.CsRandom = CsRandom; W.CsStopwatch = CsStopwatch; W.CsStringBuilder = CsStringBuilder;
    W.__ntup = function (a, names) { names.forEach(function (n, i) { if (n) Object.defineProperty(a, n, { get: function () { return this[i]; }, set: function (v) { this[i] = v; }, enumerable: false, configurable: true }); }); return a; };
    W.__at = function (a, n) { return a[a.length - n]; };
    W.__throw = function (e) { throw e; };
    W.__slice = function (a, x, y) { return typeof a === 'string' ? a.slice(x, y) : Array.prototype.slice.call(a, x, y); }; W.__str = __str; W.__fmt = __fmt; W.__chr = __chr; W.__newArray = __newArray; W.__is = __is; W.__ovl = ovlPick;
    // métodos de extensão do C# (static ... Metodo(this string x, ...)): vira x.Metodo(...) no protótipo certo (sem sobrescrever o que já existe)
    // BCL: normalização Unicode (usada por FormatForCompare do CoreBots)
    if (!SP.Normalize) Object.defineProperty(SP, 'Normalize', { value: function (f) { return this.normalize(f && /^NF/.test(f) ? f : 'NFC'); }, writable: true, configurable: true, enumerable: false });
    W.NormalizationForm = W.NormalizationForm || { FormC: 'NFC', FormD: 'NFD', FormKC: 'NFKC', FormKD: 'NFKD' };
    W.UnicodeCategory = W.UnicodeCategory || { NonSpacingMark: 'NonSpacingMark', UppercaseLetter: 'UppercaseLetter', LowercaseLetter: 'LowercaseLetter', DecimalDigitNumber: 'DecimalDigitNumber', SpaceSeparator: 'SpaceSeparator', OtherLetter: 'OtherLetter' };
    W.CharUnicodeInfo = W.CharUnicodeInfo || { GetUnicodeCategory: function (c) { c = String(c); return /^\p{Mn}$/u.test(c) ? 'NonSpacingMark' : /^\p{Lu}$/u.test(c) ? 'UppercaseLetter' : /^\p{Ll}$/u.test(c) ? 'LowercaseLetter' : /^\p{Nd}$/u.test(c) ? 'DecimalDigitNumber' : /^\p{Zs}$/u.test(c) ? 'SpaceSeparator' : 'OtherLetter'; } };
    W.__ext = function (cls, name, type) {
      var t = String(type).replace(/\?$/, ''), proto;
      if (/^(string|String)$/.test(t)) proto = String.prototype;
      else if (/\[\]$/.test(t) || /^(List|IList|IEnumerable|ICollection|IReadOnlyList|IReadOnlyCollection|HashSet|Array)(<|$)/.test(t)) proto = Array.prototype;
      else if (/^(int|long|short|byte|uint|double|float|decimal|Int32|Int64)$/.test(t)) proto = Number.prototype;
      else if (/^(bool|Boolean)$/.test(t)) proto = Boolean.prototype;
      else proto = Object.prototype;
      if (Object.prototype.hasOwnProperty.call(proto, name) && !(proto[name] && proto[name].__ext)) return;
      var f = function () { 'use strict'; var a = [this]; for (var i = 0; i < arguments.length; i++) a.push(arguments[i]); return cls[name].apply(cls, a); };
      f.__ext = true;
      Object.defineProperty(proto, name, { value: f, writable: true, configurable: true, enumerable: false });
    };
    W.__chk = function () { if (Bot.ShouldExit) throw new Error('__SKUA_STOP__'); };
    W.CoreBots = Core; W.IScriptInterface = iface;
    Object.keys(libs).forEach(function (k) { W[k] = libs[k]; });
    ['Alignment', 'ClassType', 'EnhancementType', 'CapeSpecial', 'HelmSpecial', 'WeaponSpecial', 'ItemCategory', 'ClassUseMode', 'SkillUseMode', 'GameActions', 'HuntPriorities', 'StringComparison', 'ColorType', 'PrivateRoomsEnum', 'Side'].forEach(function (n) { W[n] = enumProxy(n); });
    W.Option = CsOption;
    var rawSleep = Bot.Sleep; if (!rawSleep.__wrapped) { var ws = function (ms) { W.__chk(); return rawSleep(ms); }; ws.__wrapped = true; Bot.Sleep = ws; }
    if (Bot.Config && !Bot.Config.Configure) { Bot.Config.Configure = function () { return true; }; }
    if (Bot.Config && !Bot.Config.__gen) { var g = Bot.Config.Get; Bot.Config.Get = function (k, d) { var v = g(k, d); return v === undefined ? d : v; }; Bot.Config.__gen = true; }
  }

  // ---------- includes do GitHub ----------
  var RAW = 'https://raw.githubusercontent.com/BrenoHenrike/Scripts/Skua/';
  var CORE_INCLUDES = /(^|\/)(CoreBots|Core[A-Z]\w*)\.cs$/;
  async function compile(src, fetchText) {
    install();
    var tr = transpile(src), warnings = [], body = tr.js;
    // includes: CoreBots.cs vira o shim; outros includes de Core* são ignorados (aviso); includes simples são transpilados
    for (var i = 0; i < tr.includes.length; i++) {
      var inc = tr.includes[i];
      if (CORE_INCLUDES.test(inc)) { warnings.push('include ' + inc + ': usando shim parcial do CoreBots'); continue; }
      if (!fetchText) { warnings.push('include ' + inc + ' ignorado (sem acesso à internet)'); continue; }
      try { var txt = await fetchText(inc.replace(/^Scripts\//, '')); var sub = transpile(txt); body = sub.js + '\n' + body; (sub.includes || []).forEach(function (x) { if (!CORE_INCLUDES.test(x)) warnings.push('include aninhado ignorado: ' + x); }); }
      catch (e) { warnings.push('include ' + inc + ' falhou: ' + e.message); }
    }
    // argumentos nomeados que apontam para métodos de outros arquivos: agora que todos foram lidos, converte de novo
    function needs(t) { return (t.unres || []).some(function (n) { return GSIGS[n]; }); }
    Object.keys(tcache).forEach(function (k) { if (needs(tcache[k])) { var nt = transpile(tcache[k].src); tcache[k] = nt; } });
    if (needs(tr)) tr = transpile(src);
    parts = []; (function rebuild() { var done = {}; (function walk(list) { for (var i = 0; i < list.length; i++) { var rel = list[i].replace(/^Scripts\//, '').replace(/^\.?\//, ''); if (done[rel] || !tcache[rel]) continue; done[rel] = 1; walk(tcache[rel].includes || []); parts.push(tcache[rel].js); } })(tr.includes || []); })();
    if (!tr.scriptClass) throw new Error('Não achei a classe com o método ScriptMain(IScriptInterface bot)');
    var code = body + '\nvar __s = new ' + tr.scriptClass + '();\n' + 'if (__s.ScriptMain) await __s.ScriptMain(Bot);\n';
    return { code: code, warnings: warnings, scriptClass: tr.scriptClass };
  }
  async function run(src, name, fetchText) {
    var r;
    try { r = await compile(src, fetchText); }
    catch (e) { W.Bot.Log('✖ Erro ao converter o script C#: ' + e.message); throw e; }
    r.warnings.forEach(function (w) { W.Bot.Log('⚠ ' + w); });
    return W.SkuaRunner.Start(r.code, name);
  }
  // ---------- modo completo: bibliotecas Core* reais ----------
  var tcache = {};
  function stubOf(n) {
    var f = function () {};
    return new Proxy(f, { get: function (t, k) { if (k === Symbol.toPrimitive) return function () { return 0; }; if (k === 'then') return undefined; if (k === Symbol.iterator) return function* () {}; return stubOf(n + '.' + String(k)); }, apply: function () { return stubOf(n + '()'); }, construct: function () { return stubOf('new ' + n); }, set: function () { return true; } });
  }
  function makeG() {
    W.__missing = W.__missing || {};
    return new Proxy({}, {
      has: function (t, k) { return typeof k === 'string' && !(k in W) && k !== 'arguments' && k !== 'Bot' && k !== 'sleep' && k !== 'log'; },
      get: function (t, k) { if (k === Symbol.unscopables) return undefined; if (k in t) return t[k]; W.__missing['(tipo) ' + String(k)] = 1; return stubOf(String(k)); },
      set: function (t, k, v) { t[k] = v; return true; }
    });
  }
  async function compileFull(src, fetchText, onProgress, selfPath) {
    install();
    var tr = transpile(src), seen = {}, parts = [], warnings = [];
    if (selfPath) seen[selfPath.replace(/^Scripts\//, '')] = 1;
    async function loadInc(inc) {
      var rel = inc.replace(/^Scripts\//, '').replace(/^\.?\//, '');
      if (seen[rel]) return; seen[rel] = 1;
      var t = tcache[rel];
      if (!t) { if (onProgress) onProgress('baixando ' + rel); var txt = await fetchText(rel); t = tcache[rel] = transpile(txt); }
      for (var i = 0; i < (t.includes || []).length; i++) { try { await loadInc(t.includes[i]); } catch (e) { warnings.push('include ' + t.includes[i] + ' falhou: ' + e.message); } }
      parts.push(t.js);
    }
    for (var i = 0; i < tr.includes.length; i++) { try { await loadInc(tr.includes[i]); } catch (e) { warnings.push('include ' + tr.includes[i] + ' falhou: ' + e.message); } }
    if (!tr.scriptClass) throw new Error('Não achei a classe com o método ScriptMain(IScriptInterface bot)');
    W.__G = makeG();
    var code = '/*SKUA:SLOPPY*/with(__G){\n' + parts.join('\n') + '\n' + tr.js + '\nvar __s = new ' + tr.scriptClass + '();\nif (__s.ScriptMain) await __s.ScriptMain(Bot);\n}';
    return { code: code, warnings: warnings, scriptClass: tr.scriptClass, files: Object.keys(seen).length };
  }
  async function runFull(src, name, fetchText, selfPath) {
    var r;
    try { r = await compileFull(src, fetchText, function (m) { W.Bot.Log('… ' + m); }, selfPath); }
    catch (e) { W.Bot.Log('⚠ Modo completo falhou (' + e.message + '); usando modo simples'); return run(src, name, fetchText); }
    r.warnings.forEach(function (w) { W.Bot.Log('⚠ ' + w); });
    return W.SkuaRunner.Start(r.code, name);
  }
  async function fetchRepo(path) {
    var res = await fetch(RAW + path); if (!res.ok) throw new Error('HTTP ' + res.status + ' em ' + path); return res.text();
  }

  W.SkuaCS = { transpile: transpile, compile: compile, run: run, compileFull: compileFull, runFull: runFull, fetchRepo: fetchRepo, RAW: RAW, install: install, Core: Core, isCS: function (s) { return /\bScriptMain\s*\(|\bclass\s+\w+|\/\/cs_include|\busing\s+Skua/.test(s) && /;\s*$|\}\s*$/m.test(s) && !/^\s*(await|Bot\.)/m.test(s.split('\n').filter(function (l) { return l.trim() && !/^\s*\/\//.test(l); })[0] || ''); } };
})();
