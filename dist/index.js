//#region src/ids.ts
var e = "soft-proofing", t = `${e}.stage`, n = `${e}.panel`, r = `${e}.toggle`, i = "spOn", a = "spWarn", o = "spTable", s = (e) => `${t}.${e}`, c = [
	.9642,
	1,
	.8249
], l = [
	.00336,
	.0034731,
	.00287
];
function u(e, t) {
	return [
		e[0] * t[0] + e[1] * t[1] + e[2] * t[2],
		e[3] * t[0] + e[4] * t[1] + e[5] * t[2],
		e[6] * t[0] + e[7] * t[1] + e[8] * t[2]
	];
}
function d(e, t) {
	let n = Array(9);
	for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) n[r * 3 + i] = e[r * 3] * t[i] + e[r * 3 + 1] * t[3 + i] + e[r * 3 + 2] * t[6 + i];
	return n;
}
function f(e) {
	let [t, n, r, i, a, o, s, c, l] = e, u = a * l - o * c, d = o * s - i * l, f = i * c - a * s, p = t * u + n * d + r * f;
	if (Math.abs(p) < 1e-12) return null;
	let m = 1 / p;
	return [
		u * m,
		(r * c - n * l) * m,
		(n * o - r * a) * m,
		d * m,
		(t * l - r * s) * m,
		(r * i - t * o) * m,
		f * m,
		(n * s - t * c) * m,
		(t * a - n * i) * m
	];
}
var p = (e) => e > (24 / 116) ** 3 ? Math.cbrt(e) : 841 / 108 * e + 16 / 116, m = (e) => e > 24 / 116 ? e * e * e : 108 / 841 * (e - 16 / 116);
function h(e) {
	let t = p(e[0] / c[0]), n = p(e[1] / c[1]), r = p(e[2] / c[2]);
	return [
		116 * n - 16,
		500 * (t - n),
		200 * (n - r)
	];
}
function g(e) {
	let t = (e[0] + 16) / 116;
	return [
		c[0] * m(t + e[1] / 500),
		c[1] * m(t),
		c[2] * m(t - e[2] / 200)
	];
}
function _(e, t) {
	return Math.hypot(e[0] - t[0], e[1] - t[1], e[2] - t[2]);
}
var v = [
	.8951,
	.2664,
	-.1614,
	-.7502,
	1.7135,
	.0367,
	.0389,
	-.0685,
	1.0296
], y = f(v);
function b(e, t) {
	let n = u(v, e), r = u(v, t);
	return d(y, d([
		r[0] / n[0],
		0,
		0,
		0,
		r[1] / n[1],
		0,
		0,
		0,
		r[2] / n[2]
	], v));
}
var x = ([e, t]) => [
	e / t,
	1,
	(1 - e - t) / t
];
function S(e, t) {
	let [n, r, i] = e.map(x), a = [
		n[0],
		r[0],
		i[0],
		n[1],
		r[1],
		i[1],
		n[2],
		r[2],
		i[2]
	], o = x(t), s = u(f(a), o), l = [
		a[0] * s[0],
		a[1] * s[1],
		a[2] * s[2],
		a[3] * s[0],
		a[4] * s[1],
		a[5] * s[2],
		a[6] * s[0],
		a[7] * s[1],
		a[8] * s[2]
	];
	return d(b(o, c), l);
}
var C = [.3127, .329];
function w(e) {
	let t = Math.abs(e), n = t <= .04045 ? t / 12.92 : ((t + .055) / 1.055) ** 2.4;
	return e < 0 ? -n : n;
}
function T(e) {
	let t = Math.abs(e), n = t <= .0031308 ? t * 12.92 : 1.055 * t ** (1 / 2.4) - .055;
	return e < 0 ? -n : n;
}
//#endregion
//#region src/builtins.ts
var E = (e) => w(Math.min(1, Math.max(0, e))), ee = (e) => Math.max(0, e) ** (563 / 256);
function D(e, t, n) {
	return {
		description: e,
		version: 4,
		deviceClass: "mntr",
		colourSpace: "RGB",
		channels: 3,
		pcs: "XYZ",
		mediaWhite: [...c],
		aToB: [],
		bToA: [],
		matrixShaper: {
			matrix: S(t, C),
			curves: [
				n,
				n,
				n
			]
		},
		grayTrc: null
	};
}
var O = [
	{
		id: "screen:srgb",
		label: "sRGB",
		profile: D("sRGB", [
			[.64, .33],
			[.3, .6],
			[.15, .06]
		], E)
	},
	{
		id: "screen:display-p3",
		label: "Display P3",
		profile: D("Display P3", [
			[.68, .32],
			[.265, .69],
			[.15, .06]
		], E)
	},
	{
		id: "screen:adobe-rgb",
		label: "Adobe RGB (1998)",
		profile: D("Adobe RGB (1998)", [
			[.64, .33],
			[.21, .71],
			[.15, .06]
		], ee)
	}
], te = O[0].id, k = (e) => e > 1 ? 1 : e > 0 ? e : 0;
function ne(e) {
	let t = e.length;
	if (t === 0) return (e) => e;
	if (t === 1) return () => e[0];
	let n = t - 1;
	return (t) => {
		let r = k(t) * n, i = r >= n ? n - 1 : Math.floor(r), a = r - i;
		return e[i] + (e[i + 1] - e[i]) * a;
	};
}
function re(e, t = 4096) {
	let n = new Float64Array(t + 1);
	for (let r = 0; r <= t; r++) n[r] = e(r / t);
	let r = n[t] >= n[0];
	return (e) => {
		let i = r ? e : -e, a = (e) => r ? n[e] : -n[e];
		if (i <= a(0)) return 0;
		if (i >= a(t)) return 1;
		let o = 0, s = t;
		for (; s - o > 1;) {
			let e = o + s >> 1;
			a(e) < i ? o = e : s = e;
		}
		let c = a(o), l = a(s), u = l > c ? (i - c) / (l - c) : 0;
		return (o + u) / t;
	};
}
function A(e, t, n, r, i, a, o, s, c) {
	if (n.length - a <= 3) {
		ie(e, t, n, r, i, a, o, s, c);
		return;
	}
	let l = n[a], u = k(s[a]) * (l - 1), d = l === 1 ? 0 : Math.min(Math.floor(u), l - 2), f = l === 1 ? 0 : u - d, p = new Float64Array(i);
	if (A(e, t, n, r, i, a + 1, o + d * r[a], s, p), f === 0) {
		c.set(p);
		return;
	}
	let m = new Float64Array(i);
	A(e, t, n, r, i, a + 1, o + (d + 1) * r[a], s, m);
	for (let e = 0; e < i; e++) c[e] = p[e] + (m[e] - p[e]) * f;
}
function ie(e, t, n, r, i, a, o, s, c) {
	let l = n.length - a, u = [
		0,
		0,
		0
	], d = [
		0,
		0,
		0
	], f = [
		0,
		0,
		0
	], p = o;
	for (let e = 0; e < l; e++) {
		let t = n[a + e], i = k(s[a + e]) * (t - 1), o = t === 1 ? 0 : Math.min(Math.floor(i), t - 2);
		u[e] = o, d[e] = t === 1 ? 0 : i - o, f[e] = r[a + e], p += o * f[e];
	}
	if (l === 2) {
		let [e, n] = d;
		for (let r = 0; r < i; r++) {
			let i = t[p + r], a = t[p + f[0] + r], o = t[p + f[1] + r], s = t[p + f[0] + f[1] + r], l = i + (a - i) * e, u = o + (s - o) * e;
			c[r] = l + (u - l) * n;
		}
		return;
	}
	if (l === 1) {
		for (let e = 0; e < i; e++) {
			let n = t[p + e];
			c[e] = n + (t[p + f[0] + e] - n) * d[0];
		}
		return;
	}
	if (e) {
		let [e, n, r] = d, [a, o, s] = f;
		for (let l = 0; l < i; l++) {
			let i = (e, n, r) => t[p + e * a + n * o + r * s + l], u = (i(0, 0, 0) + (i(1, 0, 0) - i(0, 0, 0)) * e) * (1 - n) + (i(0, 1, 0) + (i(1, 1, 0) - i(0, 1, 0)) * e) * n, d = (i(0, 0, 1) + (i(1, 0, 1) - i(0, 0, 1)) * e) * (1 - n) + (i(0, 1, 1) + (i(1, 1, 1) - i(0, 1, 1)) * e) * n;
			c[l] = u + (d - u) * r;
		}
		return;
	}
	let m = [
		0,
		1,
		2
	].sort((e, t) => d[t] - d[e]), h = p + f[m[0]], g = h + f[m[1]], _ = g + f[m[2]], [v, y, b] = [
		d[m[0]],
		d[m[1]],
		d[m[2]]
	];
	for (let e = 0; e < i; e++) {
		let n = t[p + e], r = t[h + e], i = t[g + e], a = t[_ + e];
		c[e] = n + v * (r - n) + y * (i - r) + b * (a - i);
	}
}
function ae(e, t) {
	let n = Array(e.length), r = t;
	for (let t = e.length - 1; t >= 0; t--) n[t] = r, r *= e[t];
	return n;
}
var oe = /* @__PURE__ */ new WeakMap();
function se(e, t) {
	switch (e.kind) {
		case "curves": {
			let n = new Float64Array(e.curves.length);
			for (let r = 0; r < n.length; r++) n[r] = e.curves[r](t[r]);
			return n;
		}
		case "matrix": {
			let { m: n, offset: r } = e, i = /* @__PURE__ */ new Float64Array(3);
			for (let e = 0; e < 3; e++) i[e] = n[e * 3] * t[0] + n[e * 3 + 1] * t[1] + n[e * 3 + 2] * t[2] + (r ? r[e] : 0);
			return i;
		}
		case "clut": {
			let n = oe.get(e.table);
			n || (n = ae(e.grid, e.outputs), oe.set(e.table, n));
			let r = new Float64Array(e.outputs);
			return A(e.trilinear === !0, e.table, e.grid, n, e.outputs, 0, 0, t, r), r;
		}
	}
}
function ce(e, t) {
	let n = Float64Array.from({ length: e.inputs }, (e, n) => t[n]);
	for (let t of e.steps) n = se(t, n);
	for (let e = 0; e < n.length; e++) n[e] = k(n[e]);
	return n;
}
//#endregion
//#region src/icc/profile.ts
var j = {
	notIcc: "This file isn't an ICC profile, or it's damaged.",
	kind: "This is a device link, abstract or named colour profile. Soft proofing needs a printer, display or colour space profile.",
	colourSpace: "This profile's colour space isn't one Safelight can proof.",
	oneWay: "This profile can't convert both into and out of its colour space, which a proof needs.",
	tagType: "This profile uses a table or curve type Safelight can't read."
}, le = 128, ue = 256, de = [
	1,
	3,
	4,
	5,
	7
], fe = [
	"scnr",
	"mntr",
	"prtr",
	"link",
	"spac",
	"abst",
	"nmcl"
], pe = class {
	bytes;
	view;
	constructor(e) {
		this.bytes = e, this.view = new DataView(e.buffer, e.byteOffset, e.byteLength);
	}
	sig(e) {
		let t = this.bytes;
		return String.fromCharCode(t[e], t[e + 1], t[e + 2], t[e + 3]);
	}
	u8(e) {
		return this.view.getUint8(e);
	}
	u16(e) {
		return this.view.getUint16(e);
	}
	u32(e) {
		return this.view.getUint32(e);
	}
	s15(e) {
		return this.view.getInt32(e) / 65536;
	}
}, M = class extends Error {
	reason;
	constructor(e) {
		super(e), this.reason = e;
	}
};
function N(e, t = j.notIcc) {
	if (!e) throw new M(t);
}
function P(e, t, n) {
	N(t + 12 <= n);
	let r = e.sig(t);
	if (r === "curv") {
		let r = e.u32(t + 8);
		if (N(t + 12 + r * 2 <= n), r === 0) return {
			curve: (e) => e,
			size: 12
		};
		if (r === 1) {
			let n = e.u16(t + 12) / 256;
			return {
				curve: (e) => e > 0 ? e ** n : 0,
				size: 14
			};
		}
		let i = new Float64Array(r);
		for (let n = 0; n < r; n++) i[n] = e.u16(t + 12 + n * 2) / 65535;
		return {
			curve: ne(i),
			size: 12 + r * 2
		};
	}
	N(r === "para", j.tagType);
	let i = e.u16(t + 8), a = de[i];
	N(a !== void 0, j.tagType), N(t + 12 + a * 4 <= n);
	let [o, s = 1, c = 0, l = 0, u = 0, d = 0, f = 0] = Array.from({ length: a }, (n, r) => e.s15(t + 12 + r * 4)), p = (e) => e > 0 ? e ** o : 0, m;
	switch (i) {
		case 0:
			m = (e) => p(e);
			break;
		case 1:
			m = (e) => e >= -c / s ? p(s * e + c) : 0;
			break;
		case 2:
			m = (e) => e >= -c / s ? p(s * e + c) + l : l;
			break;
		case 3:
			m = (e) => e >= u ? p(s * e + c) : l * e;
			break;
		default: m = (e) => e >= u ? p(s * e + c) + d : l * e + f;
	}
	return {
		curve: (e) => Math.min(1, Math.max(0, m(Math.min(1, Math.max(0, e))))),
		size: 12 + a * 4
	};
}
function F(e, t, n, r) {
	let i = [], a = t;
	for (let t = 0; t < r; t++) {
		let { curve: t, size: r } = P(e, a, n);
		i.push(t), a += r + 3 & -4;
	}
	return i;
}
var me = (e) => e.every((e, t) => Math.abs(e - +(t % 4 == 0)) < 1e-6);
function he(e) {
	return {
		kind: "curves",
		curves: e.map((e) => ne(e))
	};
}
function ge(e, t, n) {
	let r = t.offset, i = r + t.size;
	N(t.size >= 52);
	let a = e.u8(r + 8), o = e.u8(r + 9), s = e.u8(r + 10);
	N(a > 0 && o > 0 && s > 0);
	let c = Array.from({ length: 9 }, (t, n) => e.s15(r + 12 + n * 4)), l = n ? 2 : 1, u = n ? 65535 : 255, d = n ? (t) => e.u16(t) : (t) => e.u8(t), f = n ? e.u16(r + 48) : 256, p = n ? e.u16(r + 50) : 256, m = r + (n ? 52 : 48), h = (e, t) => {
		N(m + e * t * l <= i);
		let n = [];
		for (let r = 0; r < e; r++) {
			let e = new Float64Array(t);
			for (let n = 0; n < t; n++, m += l) e[n] = d(m) / u;
			n.push(e);
		}
		return n;
	}, g = [];
	a === 3 && !me(c) && g.push({
		kind: "matrix",
		m: c,
		offset: null
	}), g.push(he(h(a, f)));
	let _ = s ** a * o;
	N(m + _ * l <= i);
	let v = new Float32Array(_);
	for (let e = 0; e < _; e++, m += l) v[e] = d(m) / u;
	return g.push({
		kind: "clut",
		grid: Array(a).fill(s),
		outputs: o,
		table: v
	}), g.push(he(h(o, p))), {
		inputs: a,
		outputs: o,
		steps: g
	};
}
function _e(e, t, n, r, i) {
	N(t + 20 <= n);
	let a = Array.from({ length: r }, (n, r) => e.u8(t + r));
	N(a.every((e) => e > 0));
	let o = e.u8(t + 16);
	N(o === 1 || o === 2, j.tagType);
	let s = a.reduce((e, t) => e * t, 1) * i;
	N(t + 20 + s * o <= n);
	let c = new Float32Array(s);
	for (let n = 0; n < s; n++) c[n] = o === 2 ? e.u16(t + 20 + n * 2) / 65535 : e.u8(t + 20 + n) / 255;
	return {
		kind: "clut",
		grid: a,
		outputs: i,
		table: c
	};
}
function ve(e, t, n) {
	N(t + 48 <= n);
	let r = Array.from({ length: 12 }, (n, r) => e.s15(t + r * 4));
	return {
		kind: "matrix",
		m: r.slice(0, 9),
		offset: [
			r[9],
			r[10],
			r[11]
		]
	};
}
function ye(e, t, n) {
	let r = t.offset, i = r + t.size;
	N(t.size >= 32);
	let a = e.u8(r + 8), o = e.u8(r + 9);
	N(a > 0 && o > 0);
	let [s, c, l, u, d] = [
		12,
		16,
		20,
		24,
		28
	].map((t) => e.u32(r + t)), f = n ? a : o, p = n ? o : a, m = d ? {
		kind: "curves",
		curves: F(e, r + d, i, f)
	} : null, h = u ? _e(e, r + u, i, n ? a : p, n ? p : o) : null, g = l ? {
		kind: "curves",
		curves: F(e, r + l, i, p)
	} : null, _ = c && p === 3 ? ve(e, r + c, i) : null;
	N(s !== 0);
	let v = {
		kind: "curves",
		curves: F(e, r + s, i, p)
	};
	return N(h !== null || a === o), {
		inputs: a,
		outputs: o,
		steps: (n ? [
			m,
			h,
			g,
			_,
			v
		] : [
			v,
			_,
			g,
			h,
			m
		]).filter((e) => e !== null)
	};
}
function be(e) {
	return {
		...e,
		steps: e.steps.map((e) => e.kind === "clut" ? {
			...e,
			trilinear: !0
		} : e)
	};
}
function xe(e, t, n, r) {
	let i = Se(e, t, n, r);
	return i && !n && r === "Lab" ? {
		...i,
		lut: be(i.lut)
	} : i;
}
function Se(e, t, n, r) {
	if (!t) return;
	N(t.size >= 12);
	let i = e.sig(t.offset), a = (e) => r === "XYZ" ? "xyz" : e ? "lab-v2" : "lab-v4";
	if (i === "mft2") return {
		lut: ge(e, t, !0),
		pcs: a(!0)
	};
	if (i === "mft1") return {
		lut: ge(e, t, !1),
		pcs: a(!1)
	};
	if (i === "mAB " && n) return {
		lut: ye(e, t, !0),
		pcs: a(!1)
	};
	if (i === "mBA " && !n) return {
		lut: ye(e, t, !1),
		pcs: a(!1)
	};
	throw new M(j.tagType);
}
function Ce(e, t) {
	if (!t || t.size < 20 || e.sig(t.offset) !== "XYZ ") return null;
	let n = t.offset + 8;
	return [
		e.s15(n),
		e.s15(n + 4),
		e.s15(n + 8)
	];
}
function we(e, t) {
	if (!t || t.size < 12) return "";
	let n = t.offset, r = "", i = e.sig(n);
	if (i === "desc") {
		let i = e.u32(n + 8);
		if (12 + i > t.size) return "";
		for (let t = 0; t < Math.min(i, ue); t++) r += String.fromCharCode(e.u8(n + 12 + t));
	} else if (i === "mluc") {
		if (t.size < 28 || e.u32(n + 8) < 1) return "";
		let i = Math.min(e.u32(n + 20), ue * 2), a = e.u32(n + 24);
		if (a + i > t.size) return "";
		for (let t = 0; t + 1 < i; t += 2) r += String.fromCharCode(e.u16(n + a + t));
	} else if (i === "text") for (let i = 8; i < Math.min(t.size, 264); i++) r += String.fromCharCode(e.u8(n + i));
	return r.split("\0")[0].trim();
}
function Te(e) {
	switch (e) {
		case "GRAY": return 1;
		case "RGB ":
		case "CMY ": return 3;
		case "CMYK": return 4;
	}
	let t = /^([2-9A-F])CLR$/.exec(e);
	return t ? parseInt(t[1], 16) : 0;
}
function Ee(e, t) {
	let n = e.u32(le);
	N(132 + n * 12 <= t);
	let r = /* @__PURE__ */ new Map();
	for (let i = 0; i < n; i++) {
		let n = 132 + i * 12, a = {
			offset: e.u32(n + 4),
			size: e.u32(n + 8)
		};
		N(a.offset + a.size <= t), r.set(e.sig(n), a);
	}
	return r;
}
function De(e) {
	if (e.length < 132) return "";
	let t = new pe(e);
	try {
		let n = t.u32(0);
		return t.sig(36) !== "acsp" || n > e.length ? "" : we(t, Ee(t, n).get("desc"));
	} catch {
		return "";
	}
}
function Oe(e) {
	try {
		return {
			ok: !0,
			profile: ke(new pe(e))
		};
	} catch (e) {
		if (e instanceof M) return {
			ok: !1,
			error: e.reason
		};
		if (e instanceof RangeError) return {
			ok: !1,
			error: j.notIcc
		};
		throw e;
	}
}
function ke(e) {
	N(e.bytes.length >= 132);
	let t = e.u32(0);
	N(e.sig(36) === "acsp" && t >= 132 && t <= e.bytes.length);
	let n = e.u8(8) + (e.u8(9) >> 4) / 10, r = fe.find((t) => t === e.sig(12));
	N(r !== void 0), N(r !== "link" && r !== "abst" && r !== "nmcl", j.kind);
	let i = e.sig(16), a = Te(i);
	N(a > 0, j.colourSpace);
	let o = e.sig(20);
	N(o === "XYZ " || o === "Lab ");
	let s = o === "XYZ " ? "XYZ" : "Lab", l = Ee(e, t), u = (e, t) => !e || (t ? e.lut.inputs === a && e.lut.outputs === 3 : e.lut.inputs === 3 && e.lut.outputs === a), d = [
		0,
		1,
		2
	].map((t) => xe(e, l.get(`A2B${t}`), !0, s)), f = [
		0,
		1,
		2
	].map((t) => xe(e, l.get(`B2A${t}`), !1, s));
	N(d.every((e) => u(e, !0)) && f.every((e) => u(e, !1)));
	let p = null, m = [
		"rXYZ",
		"gXYZ",
		"bXYZ"
	].map((t) => Ce(e, l.get(t))), h = [
		"rTRC",
		"gTRC",
		"bTRC"
	].map((e) => l.get(e));
	if (i === "RGB " && s === "XYZ" && m.every((e) => e) && h.every((e) => e)) {
		let [t, n, r] = m, i = h.map((t) => P(e, t.offset, t.offset + t.size).curve);
		p = {
			matrix: [
				t[0],
				n[0],
				r[0],
				t[1],
				n[1],
				r[1],
				t[2],
				n[2],
				r[2]
			],
			curves: [
				i[0],
				i[1],
				i[2]
			]
		};
	}
	let g = l.get("kTRC"), _ = i === "GRAY" && g ? P(e, g.offset, g.offset + g.size).curve : null;
	N(!!(d[0] && f[0] || p || _), j.oneWay);
	let v = Ce(e, l.get("wtpt")), y = !v || n < 4 && r === "mntr" ? [...c] : v;
	return {
		description: we(e, l.get("desc")),
		version: n,
		deviceClass: r,
		colourSpace: i.trim(),
		channels: a,
		pcs: s,
		mediaWhite: y,
		aToB: d,
		bToA: f,
		matrixShaper: p,
		grayTrc: _
	};
}
//#endregion
//#region src/library.ts
var I = "profiles", L = "user:", R = {
	tooBig: "This file is too large to be an ICC profile.",
	unreadable: "This file couldn't be read.",
	notStored: "Safelight couldn't store this profile. Try again, or restart Safelight."
}, Ae = 1e4;
function je(e) {
	return e.deviceClass === "prtr" ? "print" : e.deviceClass === "mntr" || e.deviceClass === "spac" && e.colourSpace === "RGB" ? "screen" : "other";
}
var Me = O.map(({ id: e, label: t, profile: n }) => ({
	id: e,
	label: t,
	group: "screen",
	profile: n,
	user: !1
})), Ne = (e) => typeof e == "object" && !!e && typeof e.id == "string" && e.id.startsWith(L) && typeof e.label == "string";
async function Pe(e) {
	let t = await crypto.subtle.digest("SHA-1", e);
	return Array.from(new Uint8Array(t), (e) => e.toString(16).padStart(2, "0")).join("");
}
var Fe = class {
	settings;
	bytes;
	user = /* @__PURE__ */ new Map();
	unreadable = /* @__PURE__ */ new Set();
	listeners = /* @__PURE__ */ new Set();
	syncing = Promise.resolve();
	readTimeoutMs;
	constructor(e, t, n = {}) {
		this.settings = e, this.bytes = t, this.readTimeoutMs = n.readTimeoutMs ?? Ae;
	}
	entries() {
		return [...Me, ...this.listed().flatMap((e) => this.user.get(e.id) ?? [])];
	}
	get(e) {
		return this.entries().find((t) => t.id === e) ?? null;
	}
	unavailable() {
		return this.listed().filter((e) => !this.user.has(e.id)).map(({ id: e, label: t }) => ({
			id: e,
			label: t,
			reason: this.unreadable.has(e) ? "unreadable" : "loading"
		}));
	}
	isUnreadable(e) {
		return this.unreadable.has(e);
	}
	isLoading(e) {
		return this.unavailable().some((t) => t.id === e && t.reason === "loading");
	}
	subscribe(e) {
		return this.listeners.add(e), () => void this.listeners.delete(e);
	}
	sync() {
		return this.syncing = this.syncing.then(() => this.load().catch((e) => console.warn("[soft-proofing] reading profiles failed:", e))), this.syncing;
	}
	async add(e, t) {
		if (e.length > 33554432) return {
			ok: !1,
			error: R.tooBig
		};
		let n = Oe(e);
		if (!n.ok) return n;
		let r = `${L}${await Pe(e)}`, i = this.get(r);
		if (i) return {
			ok: !0,
			entry: i
		};
		try {
			await this.bytes.put(r, e);
		} catch {
			return {
				ok: !1,
				error: R.notStored
			};
		}
		let a = De(e) || t.replace(/\.(icc|icm)$/i, "");
		return this.unreadable.delete(r), this.user.set(r, {
			id: r,
			label: a,
			group: je(n.profile),
			profile: n.profile,
			user: !0
		}), this.settings.set(I, [...this.listed().filter((e) => e.id !== r), {
			id: r,
			label: a
		}]), this.changed(), {
			ok: !0,
			entry: this.user.get(r)
		};
	}
	async remove(e) {
		e.startsWith(L) && (this.settings.set(I, this.listed().filter((t) => t.id !== e)), this.user.delete(e), this.unreadable.delete(e), this.changed(), await this.bytes.remove(e));
	}
	listed() {
		let e = this.settings.get(I, []);
		return Array.isArray(e) ? e.filter(Ne) : [];
	}
	async load() {
		let e = this.listed(), t = new Set(e.map((e) => e.id)), n = !1;
		for (let e of [...this.user.keys(), ...this.unreadable]) t.has(e) || (this.user.delete(e), this.unreadable.delete(e), n = !0);
		for (let { id: t, label: r } of e) {
			if (this.user.has(t) || this.unreadable.has(t)) continue;
			let e = await this.read(t);
			if (e === "failed" || !this.listed().some((e) => e.id === t)) continue;
			let i = e ? Oe(e) : null;
			i?.ok ? this.user.set(t, {
				id: t,
				label: r,
				group: je(i.profile),
				profile: i.profile,
				user: !0
			}) : this.unreadable.add(t), n = !0;
		}
		n && this.changed();
	}
	read(e) {
		let t, n = new Promise((e) => t = setTimeout(() => e("failed"), this.readTimeoutMs)), r = this.bytes.get(e).catch(() => "failed");
		return Promise.race([r, n]).finally(() => clearTimeout(t));
	}
	changed() {
		for (let e of this.listeners) try {
			e();
		} catch (e) {
			console.warn("[soft-proofing] a profile list listener failed:", e);
		}
	}
}, z = {
	perceptual: 0,
	relative: 1,
	saturation: 2,
	absolute: 3
}, B = 65535 / 32768, Ie = 65535 / 65280, V = 65535 / 256;
function Le(e, t) {
	switch (t) {
		case "xyz": return [
			e[0] * B,
			e[1] * B,
			e[2] * B
		];
		case "lab-v4": return g([
			e[0] * 100,
			e[1] * 255 - 128,
			e[2] * 255 - 128
		]);
		case "lab-v2": return g([
			e[0] * Ie * 100,
			e[1] * V - 128,
			e[2] * V - 128
		]);
	}
}
function Re(e, t) {
	if (t === "xyz") return [
		e[0] / B,
		e[1] / B,
		e[2] / B
	];
	let [n, r, i] = h(e);
	return t === "lab-v4" ? [
		n / 100,
		(r + 128) / 255,
		(i + 128) / 255
	] : [
		n / 100 / Ie,
		(r + 128) / V,
		(i + 128) / V
	];
}
var ze = [
	0,
	1,
	2,
	1
];
function H(e, t) {
	return e[ze[t]] ?? e[0];
}
function U(e) {
	return e.matrixShaper !== null || e.grayTrc !== null;
}
var W = (e) => e > 1 ? 1 : e > 0 ? e : 0, Be = /* @__PURE__ */ new WeakMap();
function Ve(e) {
	let t = Be.get(e);
	return t || (t = re(e), Be.set(e, t)), t;
}
function G(e, t) {
	let n = H(e.aToB, t);
	if (n) return (e) => Le(ce(n.lut, e), n.pcs);
	if (e.matrixShaper) {
		let { matrix: t, curves: n } = e.matrixShaper;
		return (e) => u(t, [
			n[0](e[0]),
			n[1](e[1]),
			n[2](e[2])
		]);
	}
	let r = e.grayTrc;
	return e.pcs === "XYZ" ? (e) => {
		let t = r(e[0]);
		return [
			c[0] * t,
			c[1] * t,
			c[2] * t
		];
	} : (e) => g([
		r(e[0]) * 100,
		0,
		0
	]);
}
function K(e, t) {
	let n = H(e.bToA, t);
	if (n) return (e) => ce(n.lut, Re(e, n.pcs));
	if (e.matrixShaper) {
		let { matrix: t, curves: n } = e.matrixShaper, r = f(t);
		if (!r) throw Error("The profile's colorants are singular.");
		let i = n.map(Ve);
		return (e) => {
			let t = u(r, e);
			return Float64Array.of(i[0](W(t[0])), i[1](W(t[1])), i[2](W(t[2])));
		};
	}
	let r = Ve(e.grayTrc);
	return e.pcs === "XYZ" ? (e) => Float64Array.of(r(W(e[1]))) : (e) => Float64Array.of(r(W(h(e)[0] / 100)));
}
function He(e) {
	switch (e.colourSpace) {
		case "RGB":
		case "GRAY": return Array(e.channels).fill(0);
		case "CMYK":
		case "CMY": return Array(e.channels).fill(1);
		default: return null;
	}
}
var Ue = (e) => g([
	Math.min(h(e)[0], 50),
	0,
	0
]);
function q(e, t) {
	let n = He(e);
	return n ? Ue(G(e, t)(n)) : [
		0,
		0,
		0
	];
}
function We(e, t) {
	let n = K(e, t), r = G(e, z.relative);
	return (e) => h(r(n(g(e))));
}
function J(e, t) {
	return e.version >= 4 && (t === z.perceptual || t === z.saturation) ? U(e) ? q(e, z.relative) : [...l] : t === z.relative && e.deviceClass === "prtr" && e.colourSpace === "CMYK" ? Ue(g(We(e, z.perceptual)([
		0,
		0,
		0
	]))) : q(e, t);
}
function Ge(e, t) {
	let n = e.length;
	if (n < 4) return 0;
	let r = 0, i = 0, a = 0, o = 0, s = 0, c = 0, l = 0;
	for (let u = 0; u < n; u++) {
		let n = e[u], d = n * n;
		r += n, i += d, a += d * n, o += d * d, s += t[u], c += t[u] * n, l += t[u] * d;
	}
	let d = f([
		n,
		r,
		i,
		r,
		i,
		a,
		i,
		a,
		o
	]);
	if (!d) return 0;
	let [p, m, h] = u(d, [
		s,
		c,
		l
	]);
	if (Math.abs(h) < 1e-10) return Math.abs(m) < 1e-10 ? 0 : Math.min(0, Math.max(50, -p / m));
	let g = m * m - 4 * h * p;
	return g <= 0 ? 0 : Math.max(0, Math.min(50, (-m + Math.sqrt(g)) / (2 * h)));
}
function Ke(e, t) {
	if (e.version >= 4 && (t === z.perceptual || t === z.saturation)) return U(e) ? q(e, z.relative) : [...l];
	if (H(e.bToA, t) === void 0 || ![
		"GRAY",
		"RGB",
		"CMYK"
	].includes(e.colourSpace)) return J(e, t);
	let n = t === z.relative ? h(J(e, t)) : [
		0,
		0,
		0
	], r = We(e, t), i = Math.min(50, Math.max(-50, n[1])), a = Math.min(50, Math.max(-50, n[2])), o = [], s = [];
	for (let e = 0; e < 256; e++) {
		let t = e * 100 / 255;
		o.push(t), s.push(r([
			t,
			i,
			a
		])[0]);
	}
	for (let e = 254; e > 0; e--) s[e] = Math.min(s[e], s[e + 1]);
	if (!(s[0] < s[255])) return [
		0,
		0,
		0
	];
	let c = s[0], u = s[255];
	if (t === z.relative && o.every((e, t) => e <= c + .2 * (u - c) || Math.abs(e - s[t]) < 4)) return g(n);
	let [d, f] = t === z.relative ? [.1, .5] : [.03, .25], p = [], m = [];
	for (let e = 0; e < 256; e++) {
		let t = (s[e] - c) / (u - c);
		t >= d && t < f && (p.push(o[e]), m.push(t));
	}
	return p.length < 3 ? [
		0,
		0,
		0
	] : g([
		Math.max(0, Ge(p, m)),
		n[1],
		n[2]
	]);
}
function qe(e, t) {
	if (e.every((e, n) => e === t[n])) return null;
	let n = [
		0,
		1,
		2
	].map((n) => (t[n] - c[n]) / (e[n] - c[n])), r = [
		0,
		1,
		2
	].map((n) => -c[n] * (t[n] - e[n]) / (e[n] - c[n]));
	return (e) => [
		n[0] * e[0] + r[0],
		n[1] * e[1] + r[1],
		n[2] * e[2] + r[2]
	];
}
var Je = (e, t) => (n) => [
	n[0] * e[0] / t[0],
	n[1] * e[1] / t[1],
	n[2] * e[2] / t[2]
], Ye = .5, Xe = 8, Ze = 1, Qe = 5;
function $e(e, t) {
	let { intent: n, simulatePaper: r } = t, i = e.mediaWhite, a = n === z.absolute, o = !a && (t.blackPointCompensation || e.version >= 4 && (n === z.perceptual || n === z.saturation)), s = a ? Je(c, i) : o ? qe([
		0,
		0,
		0
	], Ke(e, n)) : null, l = K(e, n), u = G(e, z.relative), d = r ? Je(i, c) : t.displayBlack === !1 ? null : qe(J(e, z.relative), [
		0,
		0,
		0
	]), f = K(e, z.relative), p = U(e) ? Ze : Qe, m = (e) => h(u(f(g(e)))), v = (e) => l(s ? s(e) : e);
	return {
		device: v,
		proof(e) {
			let t = u(v(e));
			return d ? d(t) : t;
		},
		gamut(e) {
			let t = h(e), n = m(t), r = m(n), i = _(t, n), a = _(n, r), o = i < p || a < p ? i - p : (a === 0 ? i : i / a) - p;
			return Math.min(Xe, Math.max(-8, o));
		}
	};
}
//#endregion
//#region src/prefs.ts
var Y = {
	magenta: {
		label: "Magenta",
		rgb: [
			1,
			0,
			1
		]
	},
	red: {
		label: "Red",
		rgb: [
			1,
			0,
			0
		]
	},
	green: {
		label: "Green",
		rgb: [
			0,
			1,
			0
		]
	},
	cyan: {
		label: "Cyan",
		rgb: [
			0,
			1,
			1
		]
	},
	grey: {
		label: "Grey",
		rgb: [
			.5,
			.5,
			.5
		]
	}
}, et = {
	[z.perceptual]: "Perceptual",
	[z.relative]: "Relative colorimetric",
	[z.saturation]: "Saturation",
	[z.absolute]: "Absolute colorimetric"
}, tt = {
	profile: "profile",
	intent: "intent",
	blackPointCompensation: "blackPointCompensation",
	simulatePaper: "simulatePaper",
	gamutWarning: "gamutWarning",
	warnColour: "warnColour"
}, nt = {
	profile: te,
	intent: z.relative,
	blackPointCompensation: !0,
	simulatePaper: !0,
	gamutWarning: !1,
	warnColour: "magenta"
}, rt = (e) => e === 0 || e === 1 || e === 2 || e === 3, it = (e) => typeof e == "string" && Object.hasOwn(Y, e);
function at(e) {
	let t = (t, n) => {
		let r = e.get(tt[t], nt[t]);
		return n(r) ? r : nt[t];
	}, n = (e) => typeof e == "boolean";
	return {
		profile: t("profile", (e) => typeof e == "string" && e.length > 0),
		intent: t("intent", rt),
		blackPointCompensation: t("blackPointCompensation", n),
		simulatePaper: t("simulatePaper", n),
		gamutWarning: t("gamutWarning", n),
		warnColour: t("warnColour", it)
	};
}
//#endregion
//#region src/rt.ts
var X, Z;
function ot(e) {
	Z = e, X = e.react;
}
//#endregion
//#region src/Panel.tsx
var st = {
	screen: "Screens",
	print: "Printers and papers",
	other: "Other"
}, ct = {
	prtr: "Printer",
	mntr: "Display",
	spac: "Colour space",
	scnr: "Input",
	link: "Device link",
	abst: "Abstract",
	nmcl: "Named colour"
}, lt = {
	loading: "Reading the profile…",
	preparing: "Preparing the proof…",
	missing: "The profile chosen isn't available any more. Choose another."
}, ut = "Removed profile";
function dt(e) {
	return `${ct[e.deviceClass]} · ${e.colourSpace} · ICC ${e.version.toFixed(1)}`;
}
var ft = {
	loading: "loading…",
	unreadable: "can't be read"
};
function pt(e, t, n) {
	let r = Object.keys(st).map((t) => ({
		title: st[t],
		items: e.filter((e) => e.group === t).map((e) => ({
			value: e.id,
			label: e.label
		}))
	})).filter((e) => e.items.length > 0), i = t.map((e) => ({
		value: e.id,
		label: `${e.label} (${ft[e.reason]})`
	}));
	return e.some((e) => e.id === n) || t.some((e) => e.id === n) || i.push({
		value: n,
		label: ut
	}), i.length > 0 && r.push({
		title: "Not available",
		items: i
	}), r;
}
function mt(e) {
	let [, t] = X.useReducer((e) => e + 1, 0);
	return X.useEffect(() => e.subscribe(t), [e]), {
		entries: e.entries(),
		unavailable: e.unavailable()
	};
}
function ht({ view: e, library: t }) {
	let { Toggle: n, Select: r, Field: i, Stack: a, Row: o, Button: s, tokens: c, alertDialog: l, confirmDialog: u } = Z.ui, { entries: d, unavailable: f } = mt(t), p = e.store((e) => e.on), m = e.store((e) => e.prefs), h = e.store((e) => e.status), g = e.store((e) => e.error), _ = Z.stores.useDevelopStore((e) => e.proof), v = d.find((e) => e.id === m.profile), y = (v?.user ? v : null) ?? f.find((e) => e.id === m.profile && e.reason === "unreadable") ?? null, b = (e, t) => Z.settings.set(tt[e], t), x = (e, t = c.textMuted) => /* @__PURE__ */ X.createElement("div", { style: {
		color: t,
		fontSize: 11
	} }, e);
	async function S() {
		let e = await Z.presets.pickFile(".icc,.icm");
		if (!e) return;
		let n = await e.arrayBuffer().then((e) => new Uint8Array(e)).catch(() => null), r = n ? await t.add(n, e.name) : {
			ok: !1,
			error: R.unreadable
		};
		r.ok ? b("profile", r.entry.id) : await l({
			title: "Couldn't add this profile",
			message: r.error
		});
	}
	async function C() {
		y && await u({
			title: `Remove ${y.label}?`,
			message: "Safelight forgets this profile. The file you added it from isn't touched.",
			confirmLabel: "Remove",
			variant: "danger"
		}) && (b("profile", te), await t.remove(y.id));
	}
	let w = h === "failed" ? `Couldn't prepare the proof: ${g ?? "unknown error"}` : lt[h];
	return /* @__PURE__ */ X.createElement("div", { style: { padding: 8 } }, /* @__PURE__ */ X.createElement(a, { gap: 8 }, /* @__PURE__ */ X.createElement(n, {
		label: "Show soft proof",
		ariaLabel: "Show soft proof",
		checked: p,
		onChange: () => e.store.getState().toggle()
	}), /* @__PURE__ */ X.createElement(i, {
		label: "Profile",
		hint: v?.user ? dt(v.profile) : void 0
	}, /* @__PURE__ */ X.createElement(r, {
		value: m.profile,
		groups: pt(d, f, m.profile),
		ariaLabel: "Profile",
		onChange: (e) => b("profile", e)
	})), /* @__PURE__ */ X.createElement(o, { gap: 6 }, /* @__PURE__ */ X.createElement(s, {
		size: "sm",
		variant: "secondary",
		onClick: () => void S(),
		title: "Add an ICC profile (.icc or .icm) for a printer and paper, or a screen"
	}, "Add profile…"), y ? /* @__PURE__ */ X.createElement(s, {
		size: "sm",
		variant: "ghost",
		onClick: () => void C()
	}, "Remove") : null), /* @__PURE__ */ X.createElement(i, { label: "Rendering intent" }, /* @__PURE__ */ X.createElement(r, {
		value: String(m.intent),
		ariaLabel: "Rendering intent",
		options: Object.values(z).map((e) => ({
			value: String(e),
			label: et[e]
		})),
		onChange: (e) => b("intent", Number(e))
	})), m.intent === z.absolute ? null : /* @__PURE__ */ X.createElement(n, {
		label: "Black point compensation",
		ariaLabel: "Black point compensation",
		checked: m.blackPointCompensation,
		onChange: (e) => b("blackPointCompensation", e)
	}), /* @__PURE__ */ X.createElement(n, {
		label: "Simulate paper and ink",
		ariaLabel: "Simulate paper and ink",
		checked: m.simulatePaper,
		onChange: (e) => b("simulatePaper", e)
	}), /* @__PURE__ */ X.createElement(n, {
		label: "Gamut warning",
		ariaLabel: "Gamut warning",
		checked: m.gamutWarning,
		onChange: (e) => b("gamutWarning", e)
	}), m.gamutWarning ? /* @__PURE__ */ X.createElement(i, { label: "Warning colour" }, /* @__PURE__ */ X.createElement(r, {
		value: m.warnColour,
		ariaLabel: "Gamut warning colour",
		options: Object.keys(Y).map((e) => ({
			value: e,
			label: Y[e].label
		})),
		onChange: (e) => b("warnColour", e)
	})) : null, p && w ? x(w, h === "failed" ? c.textPrimary : c.textMuted) : null, p && _ ? x("Safelight's export colour space proof is on too, so the photo is proofed twice. Turn it off with Proof in the status bar.") : null));
}
//#endregion
//#region src/profile-bytes.ts
var gt = "safelight-soft-proofing", _t = 1, Q = "profiles";
function vt(e = () => globalThis.indexedDB) {
	let t = null, n = () => new Promise((n, r) => {
		let i = e();
		if (!i) return r(/* @__PURE__ */ Error("IndexedDB isn't available"));
		let a = i.open(gt, _t);
		a.onupgradeneeded = () => {
			a.result.objectStoreNames.contains(Q) || a.result.createObjectStore(Q);
		}, a.onsuccess = () => {
			let e = a.result;
			e.onversionchange = () => {
				e.close(), t = null;
			}, n(e);
		}, a.onerror = () => r(a.error ?? /* @__PURE__ */ Error("the profile store couldn't be opened"));
	}), r = () => (t ??= n().catch((e) => {
		throw t = null, e;
	}), t);
	function i(e, t) {
		return r().then((n) => new Promise((r, i) => {
			let a = n.transaction(Q, e), o = t(a.objectStore(Q));
			a.oncomplete = () => r(o?.result ?? null), a.onerror = () => i(a.error ?? /* @__PURE__ */ Error("the profile couldn't be stored")), a.onabort = () => i(a.error ?? /* @__PURE__ */ Error("the profile couldn't be stored"));
		}));
	}
	return {
		async get(e) {
			let t = await i("readonly", (t) => t.get(e));
			return t ? new Uint8Array(t) : null;
		},
		async put(e, t) {
			await i("readwrite", (n) => void n.put(t.slice().buffer, e));
		},
		async remove(e) {
			await i("readwrite", (t) => void t.delete(e));
		}
	};
}
var yt = `
{
  if (${i} != 0) {
    highp ivec2 spSize = textureSize(${o}, 0);
    float spN = float(spSize.y);
    if (spSize.y >= 2 && spSize.x == spSize.y * spSize.y) {
      vec3 spAt = clamp(c, 0.0, 1.0) * (spN - 1.0);
      float spSlice = min(floor(spAt.b), spN - 2.0);
      vec2 spTexel = 1.0 / vec2(spSize);
      vec2 spXy = spAt.rg + 0.5;
      vec4 spLo = texture(${o}, (vec2(spSlice * spN, 0.0) + spXy) * spTexel);
      vec4 spHi = texture(${o}, (vec2((spSlice + 1.0) * spN, 0.0) + spXy) * spTexel);
      vec4 spShown = mix(spLo, spHi, spAt.b - spSlice);
      c = (${a}.a > 0.5 && spShown.a >= ${Ye.toFixed(2)}) ? ${a}.rgb : spShown.rgb;
    }
  }
}
`;
function bt() {
	return {
		id: t,
		name: "Soft proof",
		phase: "output-encode",
		priority: 990,
		space: {
			encoding: "perceptual",
			primaries: "rec2020"
		},
		viewOnly: !0,
		presetScope: "per-image",
		uniforms: [{
			key: i,
			glslType: "int",
			default: 0
		}, {
			key: a,
			glslType: "vec4",
			default: [
				0,
				0,
				0,
				0
			]
		}],
		textures: [{
			key: o,
			kind: "lut",
			format: "rgba16f"
		}],
		glsl: yt,
		dormantWhen: { [i]: 0 }
	};
}
//#endregion
//#region src/space.ts
var xt = S([
	[.708, .292],
	[.17, .797],
	[.131, .046]
], C), St = f(xt);
function Ct(e) {
	return u(xt, [
		w(e[0]),
		w(e[1]),
		w(e[2])
	]);
}
function wt(e) {
	let t = u(St, e);
	return [
		T(t[0]),
		T(t[1]),
		T(t[2])
	];
}
var Tt = (e, t, n, r) => ((n * e + r) * e + t) * 4, Et = 2, Dt = () => new Promise((e) => setTimeout(e, 0));
async function Ot(e, t = {}) {
	let n = t.size ?? 33, r = new Float32Array(n * n * n * 4), i = 1 / (n - 1);
	for (let a = 0; a < n; a++) {
		if (a % Et === 0 && (await Dt(), t.signal?.aborted)) return null;
		for (let t = 0; t < n; t++) for (let o = 0; o < n; o++) {
			let s = Ct([
				o * i,
				a * i,
				t * i
			]), c = wt(e.proof(s)), l = Tt(n, o, a, t);
			r[l] = c[0], r[l + 1] = c[1], r[l + 2] = c[2], r[l + 3] = e.gamut(s);
		}
	}
	return t.signal?.aborted ? null : {
		size: n,
		width: n * n,
		height: n,
		data: r
	};
}
//#endregion
//#region src/view.ts
var kt = 4, At = O[0].profile.matrixShaper.matrix;
function jt(e, t) {
	let n = Y[e].rgb, [r, i, a] = wt(u(At, [
		w(n[0]),
		w(n[1]),
		w(n[2])
	]));
	return [
		r,
		i,
		a,
		+!!t
	];
}
var Mt = (e, t) => `${e}|${t.intent}|${t.blackPointCompensation}|${t.simulatePaper}`;
function Nt(e, n, r = {}) {
	let c = r.tableSize ?? 33, l = r.warmWaitMs ?? 2e3, u = e.stores.create((t, n) => ({
		on: !1,
		prefs: at(e.settings),
		status: "off",
		error: null,
		toggle: () => t({ on: !n().on })
	})), d = /* @__PURE__ */ new Map(), f = null, p = null, m = 0, h = "null", g = !1, _ = (e, t = null) => {
		let n = u.getState();
		(n.status !== e || n.error !== t) && u.setState({
			status: e,
			error: t
		});
	};
	function v(t) {
		let n = JSON.stringify(t);
		n !== h && (e.develop.setViewValues(t), h = n);
	}
	function y(n) {
		p !== n && (m += 1, e.setStageTexture(t, o, {
			data: n.data,
			width: n.width,
			height: n.height,
			format: "rgba16f",
			version: m
		}), p = n);
	}
	function b(e, t) {
		for (d.delete(e), d.set(e, t); d.size > kt;) d.delete(d.keys().next().value);
	}
	function x() {
		f?.stop.abort(), f = null;
	}
	async function S(e, t, n) {
		x();
		let r = new AbortController();
		f = {
			key: e,
			stop: r
		}, _("preparing");
		let i;
		try {
			i = await Ot($e(n.profile, {
				intent: t.intent,
				blackPointCompensation: t.blackPointCompensation,
				simulatePaper: t.simulatePaper
			}), {
				size: c,
				signal: r.signal
			});
		} catch (e) {
			f?.stop === r && C(e);
			return;
		}
		i && !g && (f = null, b(e, i), w());
	}
	function C(e) {
		x();
		try {
			v(null);
		} catch (e) {
			console.warn("[soft-proofing] couldn't hide the proof:", e);
		}
		_("failed", e instanceof Error ? e.message : String(e));
	}
	function w() {
		if (g) return;
		let { on: e, prefs: t } = u.getState();
		if (!e) {
			x(), v(null), _("off");
			return;
		}
		let r = n.get(t.profile);
		if (!r) {
			x(), v(null), _(n.isLoading(t.profile) ? "loading" : "missing");
			return;
		}
		let o = Mt(r.id, t), c = d.get(o);
		if (!c) f?.key !== o && S(o, t, r);
		else {
			x();
			try {
				y(c), v({
					[s(i)]: 1,
					[s(a)]: jt(t.warnColour, t.gamutWarning)
				});
			} catch (e) {
				C(e);
				return;
			}
			_("ready");
		}
	}
	let T = null, E = null;
	function ee(e) {
		if (typeof requestIdleCallback == "function") {
			let t = requestIdleCallback(e, { timeout: l });
			return () => cancelIdleCallback(t);
		}
		let t = setTimeout(e, l);
		return () => clearTimeout(t);
	}
	function D() {
		let t = e.stores.useDevelopStore.getState().photoId;
		!E && t && t !== T && $(e) && (E = ee(() => {
			E = null;
			let t = e.stores.useDevelopStore.getState().photoId;
			t && $(e) && (T = t, u.getState().on || e.develop.prewarmStages());
		}));
	}
	let O = [
		u.subscribe((e, t) => {
			(e.on !== t.on || e.prefs !== t.prefs) && w();
		}),
		e.settings.onChange((t) => {
			t === "profiles" ? n.sync() : u.setState({ prefs: at(e.settings) });
		}),
		n.subscribe(w),
		e.stores.useDevelopStore.subscribe((e, t) => {
			e.photoId !== t.photoId && D();
		}),
		e.stores.useUIStore.subscribe((e, t) => {
			e.activeModule !== t.activeModule && D();
		})
	];
	return n.sync(), D(), {
		store: u,
		stop() {
			g = !0;
			for (let e of O) e();
			x(), E?.(), E = null, v(null), p && e.setStageTexture(t, o, null), p = null, d.clear();
		}
	};
}
function $(e) {
	let t = new URLSearchParams(window.location.search).get("detached");
	return (e.stores.useUIStore.getState().activeModule === "develop" || t === "develop") && !!e.stores.useDevelopStore.getState().photoId;
}
//#endregion
//#region src/index.tsx
var Pt = null;
function Ft(e, t = vt()) {
	ot(e);
	let i = new Fe(e.settings, t), a = Nt(e, i);
	Pt = {
		host: e,
		view: a
	}, e.registerProcessingStage(bt()), e.registerPanel({
		id: n,
		title: "Soft Proofing",
		component: () => /* @__PURE__ */ X.createElement(ht, {
			view: a,
			library: i
		}),
		defaultDock: {
			module: "develop",
			direction: "right"
		}
	}), e.registerKeybinding({
		id: r,
		label: "Soft proof with a profile",
		category: "Develop",
		defaultCombo: "Shift+S",
		handler: () => {
			$(e) && a.store.getState().toggle();
		}
	});
}
function It() {
	let e = Pt;
	if (e) {
		Pt = null;
		try {
			e.view.stop(), e.host.unregisterProcessingStage(t);
		} catch (e) {
			console.warn("[soft-proofing] deactivate failed:", e);
		}
	}
}
//#endregion
export { e as EXTENSION_ID, Ft as activate, It as deactivate };

//# sourceMappingURL=index.js.map