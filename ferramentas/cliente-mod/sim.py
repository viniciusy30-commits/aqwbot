# mini interpretador AVM2 so para validar os metodos injetados (mock de objetos)
import sys; sys.path.insert(0,'.')
from load import *
b,t,tg,p,a=load('./Game4000r8.patched.swf')
gi=cls(a,'Game')
meth={abcp.mname(a,tr['name']):tr['method'] for tr in a.inst[gi]['traits'] if tr['kind']==1 and abcp.mname(a,tr['name']).startswith('aqw')}
class Obj(dict): pass
class Fn:
    def __init__(s,f): s.f=f
cb={}
class EI:
    @staticmethod
    def addCallback(name,fn): cb[name]=fn
class AVMErr(Exception): pass
class Game:
    def __init__(s):
        s.world=Obj(myAvatar=Obj(dataLeaf=Obj(intHP=420,strUsername='Zed'),pMC=object()),monsters=[1,2,3])
        s.world['hit']=lambda x,y=0:x+y
        s.world['noop']=lambda:None
def getp(o,n):
    if isinstance(o,Game):
        if n in meth: return ('M',n)
        return getattr(o,str(n))
    if isinstance(o,dict):
        if n not in o: raise AVMErr('ReferenceError: 1069 '+str(n))
        return o[n]
    if n=='length' and isinstance(o,(list,str)): return len(o)
    if isinstance(o,list): return o[int(n)]
    if isinstance(o,Obj): raise AVMErr('x')
    return getattr(o,str(n))
def run(name,*args,this=None):
    m=meth[name]; d=bodyof(a,m); code=d['code']; ins=dis.disasm(code); idx={pos:i for i,(pos,_,_) in enumerate(ins)}
    loc=[this]+list(args)+[None]*(d['locals']+2); st=[]; i=0
    def handler(e):
        for fr,to,tg_,_,_ in d['exc']:
            if fr<=ins[i][0]<to: return idx[tg_]
        raise e
    nxt={ins[k][0]+0:k for k in range(len(ins))}
    scope=0
    while True:
        pos,op,ar=ins[i]; n=dis.NAMES[op]; i+=1
        try:
            if n.startswith('getlocal_'): st.append(loc[int(n[-1])])
            elif n.startswith('setlocal_'): loc[int(n[-1])]=st.pop()
            elif n=='getlocal': st.append(loc[ar[0]])
            elif n=='setlocal': loc[ar[0]]=st.pop()
            elif n=='pushscope': st.pop()
            elif n=='pushbyte': st.append(ar[0])
            elif n=='pushstring': st.append(abcp.s(a,ar[0]))
            elif n=='pushnull': st.append(None)
            elif n=='pushtrue': st.append(True)
            elif n=='label': pass
            elif n=='convert_s': v=st.pop(); st.append('null' if v is None else str(v))
            elif n=='convert_i': st.append(int(st.pop()))
            elif n=='typeof':
                v=st.pop(); st.append('string' if isinstance(v,str) else 'boolean' if isinstance(v,bool) else 'number' if isinstance(v,(int,float)) else 'object')
            elif n=='add': y=st.pop(); x=st.pop(); st.append(x+(y if isinstance(y,str) else str(y)) if isinstance(x,str) else x+y)
            elif n=='subtract': y=st.pop(); x=st.pop(); st.append(x-y)
            elif n=='swap': y=st.pop(); x=st.pop(); st+= [y,x]
            elif n=='inclocal_i': loc[ar[0]]+=1
            elif n=='newarray': st.append([st.pop() for _ in range(ar[0])][::-1])
            elif n in('ifne','ifeq','iflt','iftrue'):
                if n=='iftrue': c=bool(st.pop())
                else:
                    y=st.pop(); x=st.pop(); c=(x!=y) if n=='ifne' else (x==y) if n=='ifeq' else (x<y)
                if c: i=idx[pos+4+ar[0]]
            elif n=='jump': i=idx[pos+4+ar[0]]
            elif n=='returnvalue': return st.pop()
            elif n=='returnvoid': return None
            elif n=='getlex': st.append(EI)
            elif n=='findpropstrict': st.append('GLOBAL')
            elif n=='getproperty':
                mnm=a.mn[ar[0]-1]
                if mnm[0]==0x1B: nm=st.pop(); o=st.pop(); st.append(getp(o,nm))
                else: o=st.pop(); st.append(getp(o,abcp.mname(a,ar[0])))
            elif n=='setproperty':
                v=st.pop(); nm=st.pop(); o=st.pop(); o[nm]=v
            elif n in('callproperty','callpropvoid'):
                nm=abcp.mname(a,ar[0]); args_=[st.pop() for _ in range(ar[1])][::-1]; o=st.pop(); r=None
                if nm=='split': r=o.split(args_[0])
                elif nm=='push': o.append(args_[0])
                elif nm=='apply': r=o(*(args_[1] or [])) if callable(o) else None
                elif nm=='addCallback': o.addCallback(args_[0],args_[1])
                elif nm=='describeType': r='<type/>'
                elif nm=='toXMLString': r=o
                elif nm.startswith('aqw'): r=run(nm,*args_,this=o)
                else: raise Exception('call '+nm)
                if n=='callproperty': st.append(r)
            elif n=='nextname': ix=st.pop(); o=st.pop(); st.append(list(o.keys()) [ix-1] if isinstance(o,dict) else ix-1)
            elif n=='hasnext2':
                ob,ix=ar; 
                o=loc[ob]; 
                if isinstance(o,dict): ln=len(o)
                elif isinstance(o,list): ln=len(o)
                else: ln=0
                if loc[ix]<ln: loc[ix]+=1; st.append(True)
                else: st.append(False)
            else: raise Exception('op '+n)
        except (AVMErr,KeyError,IndexError,TypeError,AttributeError) as e:
            i=handler(e); st=[ 'Error: '+str(e) ]
g=Game()
print(run('aqwPing',this=g))
run('aqwInstall',this=g); print(sorted(cb))
for pth in ['world.myAvatar.dataLeaf.intHP','world.myAvatar.dataLeaf.strUsername','world.myAvatar.pMC','world.monsters.1','world.monsters.length','world.zzz','world.myAvatar.dataLeaf']:
    print(pth,'->',run('aqwGet',pth,this=g))
print(run('aqwKeys','world.myAvatar.dataLeaf',this=g), run('aqwKeys','world.zzz',this=g))
print(run('aqwSet','world.myAvatar.dataLeaf.intHP',99,this=g), g.world['myAvatar']['dataLeaf']['intHP'])
print(run('aqwCall','world.hit',[2,3],this=g), run('aqwCall','world.noop',[],this=g))
print(run('aqwDescribe','world',this=g))
