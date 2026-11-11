from swf import R,w30
class A: pass
def rtraits(r):
    out=[]
    for _ in range(r.u30()):
        t={}
        t['name']=r.u30(); k=r.u8(); t['kind']=k&15; t['attr']=k>>4
        kd=t['kind']
        if kd in (0,6):
            t['slot']=r.u30(); t['type']=r.u30(); t['vindex']=r.u30()
            t['vkind']=r.u8() if t['vindex'] else None
        elif kd in (1,2,3):
            t['disp']=r.u30(); t['method']=r.u30()
        elif kd==4: t['slot']=r.u30(); t['class']=r.u30()
        elif kd==5: t['slot']=r.u30(); t['fn']=r.u30()
        else: raise Exception('trait kind %d'%kd)
        if t['attr']&4: t['meta']=[r.u30() for _ in range(r.u30())]
        out.append(t)
    return out
def wtraits(ts):
    o=bytearray(w30(len(ts)))
    for t in ts:
        o+=w30(t['name']); o.append(t['kind']|(t['attr']<<4)); kd=t['kind']
        if kd in (0,6):
            o+=w30(t['slot'])+w30(t['type'])+w30(t['vindex'])
            if t['vindex']: o.append(t['vkind'])
        elif kd in (1,2,3): o+=w30(t['disp'])+w30(t['method'])
        elif kd==4: o+=w30(t['slot'])+w30(t['class'])
        elif kd==5: o+=w30(t['slot'])+w30(t['fn'])
        if t['attr']&4:
            o+=w30(len(t['meta']))
            for m in t['meta']: o+=w30(m)
    return bytes(o)
def parse(b,p0):
    r=R(b,p0); a=A()
    a.minor=r.u16(); a.major=r.u16()
    n=r.u30(); a.ints=[r.raw(0) or None]  # placeholder
    a.ints=[];
    def rd_vle(n):
        out=[]
        for _ in range(max(n-1,0)):
            s=r.p; r.u30(); out.append(bytes(b[s:r.p]))
        return out
    a.ints=rd_vle(n)
    n=r.u30(); a.uints=rd_vle(n)
    n=r.u30(); a.dbls=[r.raw(8) for _ in range(max(n-1,0))]
    n=r.u30(); a.strs=[r.raw(r.u30()) for _ in range(max(n-1,0))]
    n=r.u30(); a.ns=[(r.u8(),r.u30()) for _ in range(max(n-1,0))]
    n=r.u30(); a.nss=[[r.u30() for _ in range(r.u30())] for _ in range(max(n-1,0))]
    n=r.u30(); a.mn=[]
    for _ in range(max(n-1,0)):
        k=r.u8()
        if k in (7,0xD): a.mn.append((k,r.u30(),r.u30()))
        elif k in (0xF,0x10): a.mn.append((k,r.u30()))
        elif k in (0x11,0x12): a.mn.append((k,))
        elif k in (9,0x0E): a.mn.append((k,r.u30(),r.u30()))
        elif k in (0x1B,0x1C): a.mn.append((k,r.u30()))
        elif k==0x1D:
            q=r.u30(); a.mn.append((k,q,[r.u30() for _ in range(r.u30())]))
        else: raise Exception('mn kind %x'%k)
    n=r.u30(); a.methods=[]
    for _ in range(n):
        m={}
        pc=r.u30(); m['ret']=r.u30(); m['params']=[r.u30() for _ in range(pc)]
        m['name']=r.u30(); m['flags']=r.u8(); m['opts']=[]; m['pnames']=None
        if m['flags']&8: m['opts']=[(r.u30(),r.u8()) for _ in range(r.u30())]
        if m['flags']&0x80: m['pnames']=[r.u30() for _ in range(pc)]
        a.methods.append(m)
    n=r.u30(); a.meta=[]
    for _ in range(n):
        nm=r.u30(); c=r.u30(); ks=[r.u30() for _ in range(c)]; vs=[r.u30() for _ in range(c)]
        a.meta.append((nm,ks,vs))
    n=r.u30(); a.inst=[]
    for _ in range(n):
        i={}; i['name']=r.u30(); i['sup']=r.u30(); i['flags']=r.u8()
        i['pns']=r.u30() if i['flags']&8 else None
        i['ifs']=[r.u30() for _ in range(r.u30())]
        i['iinit']=r.u30(); i['traits']=rtraits(r); a.inst.append(i)
    a.cls=[]
    for _ in range(n):
        c={'cinit':r.u30()}; c['traits']=rtraits(r); a.cls.append(c)
    n=r.u30(); a.scripts=[]
    for _ in range(n):
        s={'init':r.u30()}; s['traits']=rtraits(r); a.scripts.append(s)
    n=r.u30(); a.bodies=[]
    for _ in range(n):
        d={}; d['method']=r.u30(); d['maxstack']=r.u30(); d['locals']=r.u30(); d['isd']=r.u30(); d['msd']=r.u30()
        d['code']=bytes(r.raw(r.u30()))
        d['exc']=[tuple(r.u30() for _ in range(5)) for _ in range(r.u30())]
        d['traits']=rtraits(r); a.bodies.append(d)
    a.end=r.p
    return a
def write(a):
    o=bytearray()
    o+=a.minor.to_bytes(2,'little')+a.major.to_bytes(2,'little')
    o+=w30(len(a.ints)+1 if a.ints else 0)
    for x in a.ints: o+=x
    o+=w30(len(a.uints)+1 if a.uints else 0)
    for x in a.uints: o+=x
    o+=w30(len(a.dbls)+1 if a.dbls else 0)
    for x in a.dbls: o+=x
    o+=w30(len(a.strs)+1 if a.strs else 0)
    for x in a.strs: o+=w30(len(x))+x
    o+=w30(len(a.ns)+1 if a.ns else 0)
    for k,v in a.ns: o.append(k); o+=w30(v)
    o+=w30(len(a.nss)+1 if a.nss else 0)
    for s in a.nss:
        o+=w30(len(s))
        for x in s: o+=w30(x)
    o+=w30(len(a.mn)+1 if a.mn else 0)
    for m in a.mn:
        k=m[0]; o.append(k)
        if k in (7,0xD,9,0x0E): o+=w30(m[1])+w30(m[2])
        elif k in (0xF,0x10,0x1B,0x1C): o+=w30(m[1])
        elif k==0x1D:
            o+=w30(m[1])+w30(len(m[2]))
            for x in m[2]: o+=w30(x)
    o+=w30(len(a.methods))
    for m in a.methods:
        o+=w30(len(m['params']))+w30(m['ret'])
        for p in m['params']: o+=w30(p)
        o+=w30(m['name'])+bytes([m['flags']])
        if m['flags']&8:
            o+=w30(len(m['opts']))
            for v,k in m['opts']: o+=w30(v)+bytes([k])
        if m['flags']&0x80:
            for p in m['pnames']: o+=w30(p)
    o+=w30(len(a.meta))
    for nm,ks,vs in a.meta:
        o+=w30(nm)+w30(len(ks))
        for x in ks: o+=w30(x)
        for x in vs: o+=w30(x)
    o+=w30(len(a.inst))
    for i in a.inst:
        o+=w30(i['name'])+w30(i['sup'])+bytes([i['flags']])
        if i['flags']&8: o+=w30(i['pns'])
        o+=w30(len(i['ifs']))
        for x in i['ifs']: o+=w30(x)
        o+=w30(i['iinit'])+wtraits(i['traits'])
    for c in a.cls: o+=w30(c['cinit'])+wtraits(c['traits'])
    o+=w30(len(a.scripts))
    for s in a.scripts: o+=w30(s['init'])+wtraits(s['traits'])
    o+=w30(len(a.bodies))
    for d in a.bodies:
        o+=w30(d['method'])+w30(d['maxstack'])+w30(d['locals'])+w30(d['isd'])+w30(d['msd'])
        o+=w30(len(d['code']))+d['code']
        o+=w30(len(d['exc']))
        for e in d['exc']:
            for x in e: o+=w30(x)
        o+=wtraits(d['traits'])
    return bytes(o)
def s(a,i): return a.strs[i-1].decode('utf8','replace') if i else ''
def nsname(a,i):
    if not i: return '*'
    k,n=a.ns[i-1]; return s(a,n)
def mname(a,i):
    if not i: return '*'
    m=a.mn[i-1]
    if m[0] in (7,0xD): return s(a,m[2])
    if m[0] in (9,0xE): return s(a,m[1])
    return '<mn%x>'%m[0]
