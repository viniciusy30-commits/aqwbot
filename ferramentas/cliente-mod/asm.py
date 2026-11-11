import sys; sys.path.insert(0,'.')
import dis
from swf import w30
OP={v:k for k,v in dis.NAMES.items()}
BR={'ifnlt','ifnle','ifngt','ifnge','jump','iftrue','iffalse','ifeq','ifne','iflt','ifle','ifgt','ifge','ifstricteq','ifstrictne'}
UNC={'jump','returnvalue','returnvoid','throw'}
class Asm:
    def __init__(s,a,nparams,locals_,isd,msd):
        s.a=a; s.ins=[]; s.np=nparams; s.nl=locals_; s.isd=isd; s.msd=msd; s.exc=[]; s.lab={}
    def L(s,name): s.ins.append(('@',name))
    def op(s,n,*args): s.ins.append((n,)+args)
    def try_(s,start,end,target): s.exc.append((start,end,target))
    def eff(s,n,args):
        a=s.a
        def mnL(i): return a.mn[i-1][0] in (0x1B,0x1C)
        if n in('getlocal_0','getlocal_1','getlocal_2','getlocal_3','getlocal','pushnull','pushundefined','pushtrue','pushfalse','pushbyte','pushshort','pushstring','pushint','dup','getlex','findpropstrict','findproperty','newactivation','getglobalscope','pushnan'):
            return (1 if n=='dup' else 0, 2 if n=='dup' else 1)
        if n in('setlocal_0','setlocal_1','setlocal_2','setlocal_3','setlocal','pop','pushscope'): return (1,0)
        if n in('convert_s','convert_i','convert_d','convert_b','typeof','not','increment','increment_i','decrement','coerce_a','coerce_s','coerce'): return (1,1)
        if n in('add','subtract','multiply','nextname','nextvalue','equals','strictequals','lessthan','greaterthan','lessequals','greaterequals','add_i'): return (2,1)
        if n=='swap': return (2,2)
        if n in('inclocal_i','inclocal','kill','label','nop','jump','debugline','debugfile'): return (0,0)
        if n in('iftrue','iffalse'): return (1,0)
        if n in BR: return (2,0)
        if n=='returnvalue': return (1,0)
        if n=='returnvoid': return (0,0)
        if n=='hasnext2': return (0,1)
        if n=='newarray': return (args[0],1)
        if n=='getproperty': return (2,1) if mnL(args[0]) else (1,1)
        if n=='setproperty': return (3,0) if mnL(args[0]) else (2,0)
        if n=='callproperty': return (args[1]+1+(1 if mnL(args[0]) else 0),1)
        if n=='callpropvoid': return (args[1]+1+(1 if mnL(args[0]) else 0),0)
        raise Exception('eff '+n)
    def build(s,catch_depth=1):
        # pass1 offsets
        off=0; offs=[]; labs={}
        for ins in s.ins:
            if ins[0]=='@': labs[ins[1]]=off; offs.append(off); continue
            offs.append(off); off+=len(s.enc(ins,{},0,dry=True))
        total=off
        out=bytearray()
        for ins,o in zip(s.ins,offs):
            if ins[0]=='@': continue
            out+=s.enc(ins,labs,o)
        # stack sim
        depth=0; maxd=0; ldepth={}
        handlers={lab for _,_,lab in s.exc}
        for ins in s.ins:
            if ins[0]=='@':
                nm=ins[1]
                if nm in handlers: depth=catch_depth
                elif nm in ldepth: 
                    if depth!=ldepth[nm] and not s._unc_prev: raise Exception('depth mismatch at '+nm)
                    depth=ldepth[nm]
                else: ldepth[nm]=depth
                s._unc_prev=False; maxd=max(maxd,depth); continue
            n=ins[0]; pop,push=s.eff(n,ins[1:])
            if depth<pop: raise Exception('stack underflow at %s %s'%(n,ins))
            depth=depth-pop+push; maxd=max(maxd,depth)
            if n in BR:
                tl=ins[1]
                if tl in ldepth:
                    if ldepth[tl]!=depth: raise Exception('branch depth %s %d vs %d'%(tl,ldepth[tl],depth))
                else: ldepth[tl]=depth
            s._unc_prev = n in UNC
            if n in UNC: depth=0
        exc=[(labs[a_],labs[b_],labs[c_],0,0) for a_,b_,c_ in s.exc]
        maxloc=s.nl
        return dict(code=bytes(out),maxstack=maxd+1,locals=maxloc,isd=s.isd,msd=s.msd,exc=exc)
    _unc_prev=False
    def enc(s,ins,labs,pos,dry=False):
        n=ins[0]; o=bytearray([OP[n]])
        if n in BR:
            if dry: o+=b'\0\0\0'
            else:
                rel=labs[ins[1]]-(pos+4)
                o+=(rel&0xffffff).to_bytes(3,'little')
        elif n in('pushbyte',): o.append(ins[1]&0xff)
        elif OP[n] in dis.U30: o+=w30(ins[1])
        elif OP[n] in dis.U30U30: o+=w30(ins[1])+w30(ins[2])
        return bytes(o)
