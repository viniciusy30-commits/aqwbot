import sys, struct, zlib
sys.path.insert(0,'.')
from load import *
from asm import Asm
SRC=sys.argv[1] if len(sys.argv)>1 else './Game4000r8.swf'
OUT=sys.argv[2] if len(sys.argv)>2 else './Game4000r8.patched.swf'
b,t,tg,p,a=load(SRC)
PUB_NS=1; PUB_SET=24; FLASH_UTILS_NS=19
assert a.ns[0]==(0x16,1) and abcp.s(a,a.ns[0][1])=='' and a.nss[23]==[1]
assert abcp.s(a,a.ns[18][1])=='flash.utils'
def S(txt):
    bt=txt.encode()
    if bt in a.strs: return a.strs.index(bt)+1
    a.strs.append(bt); return len(a.strs)
def QN(name,ns=PUB_NS):
    m=(7,ns,S(name))
    if m in a.mn: return a.mn.index(m)+1
    a.mn.append(m); return len(a.mn)
def MNL():
    m=(0x1B,PUB_SET)
    if m in a.mn: return a.mn.index(m)+1
    a.mn.append(m); return len(a.mn)
EI=13032; ADDCB=13034      # ExternalInterface / addCallback (ja existentes)
assert abcp.mname(a,EI)=='ExternalInterface' and abcp.mname(a,ADDCB)=='addCallback'
gi=cls(a,'Game'); G=a.inst[gi]
ISD,MSD=10,11
# confere que o gancho existe e tem a forma esperada
hook=[tr for tr in G['traits'] if tr['kind']==1 and abcp.mname(a,tr['name'])=='onAddedToStage'][0]
hm=hook['method']; hb=bodyof(a,hm)
assert hb['isd']==ISD and hb['msd']==MSD and not hb['exc']
assert not any(abcp.mname(a,tr['name']).startswith('aqw') for tr in G['traits']),'ja alterado'
mL=MNL(); q=lambda n:QN(n)
new=[]   # (name, nparams, body)
def add_method(name,nparams,A_build):
    idx=len(a.methods)
    a.methods.append(dict(ret=0,params=[0]*nparams,name=0,flags=0,opts=[],pnames=None))
    body=A_build; body['method']=idx; body['traits']=[]
    a.bodies.append(body)
    new.append((name,idx))
    return idx
def M(nparams,nlocals): return Asm(a,nparams,nlocals,ISD,MSD)
def LEN(A): A.op('getproperty',q('length'))

# aqwP(path) -> Array
A=M(1,2)
A.op('getlocal_0');A.op('pushscope')
A.op('getlocal_1');A.op('convert_s');A.op('pushstring',S(''));A.op('ifne','L1')
A.op('newarray',0);A.op('returnvalue')
A.L('L1');A.op('getlocal_1');A.op('convert_s');A.op('pushstring',S('.'));A.op('callproperty',q('split'),1);A.op('returnvalue')
add_method('aqwP',1,A.build())
# aqwW(parts,n) -> objeto
A=M(2,5)
A.op('getlocal_0');A.op('pushscope')
A.op('getlocal_0');A.op('setlocal_3')
A.op('pushbyte',0);A.op('setlocal',4)
A.op('jump','Lc')
A.L('Lb');A.op('label')
A.op('getlocal_3');A.op('pushnull');A.op('ifne','Lok');A.op('pushnull');A.op('returnvalue')
A.L('Lok')
A.op('getlocal_3');A.op('getlocal_1');A.op('getlocal',4);A.op('getproperty',mL);A.op('getproperty',mL);A.op('setlocal_3')
A.op('inclocal_i',4)
A.L('Lc');A.op('getlocal',4);A.op('getlocal_2');A.op('iflt','Lb')
A.op('getlocal_3');A.op('returnvalue')
add_method('aqwW',2,A.build())
# aqwO(o) -> valor seguro para o JS
A=M(1,3)
A.op('getlocal_0');A.op('pushscope')
A.op('getlocal_1');A.op('pushnull');A.op('ifne','L1');A.op('pushnull');A.op('returnvalue')
A.L('L1');A.op('getlocal_1');A.op('typeof');A.op('setlocal_2')
for ty in ('string','number','boolean'):
    A.op('getlocal_2');A.op('pushstring',S(ty));A.op('ifeq','R')
A.op('pushstring',S('@'));A.op('getlocal_1');A.op('convert_s');A.op('add');A.op('returnvalue')
A.L('R');A.op('getlocal_1');A.op('returnvalue')
add_method('aqwO',1,A.build())
mP,mW,mO=q('aqwP'),q('aqwW'),q('aqwO')
def err_handler(A):
    A.L('E');A.op('pushstring',S('!'));A.op('swap');A.op('add');A.op('returnvalue')
def lastname(A,parts):  # empilha parts[len-1]
    A.op('getlocal',parts);A.op('getlocal',parts);LEN(A);A.op('pushbyte',1);A.op('subtract');A.op('convert_i');A.op('getproperty',mL)
def parent(A,parts,dst):
    A.op('getlocal_0');A.op('getlocal',parts);A.op('getlocal',parts);LEN(A);A.op('pushbyte',1);A.op('subtract');A.op('convert_i');A.op('callproperty',mW,2);A.op('setlocal',dst)
# aqwGet(path)
A=M(1,4)
A.op('getlocal_0');A.op('pushscope')
A.L('S')
A.op('getlocal_0');A.op('getlocal_1');A.op('callproperty',mP,1);A.op('setlocal_2')
A.op('getlocal_0');A.op('getlocal_2');A.op('getlocal_2');LEN(A);A.op('callproperty',mW,2);A.op('setlocal_3')
A.op('getlocal_0');A.op('getlocal_3');A.op('callproperty',mO,1);A.op('returnvalue')
A.L('T'); err_handler(A); A.try_('S','T','E')
add_method('aqwGet',1,A.build())
# aqwCall(path,args)
A=M(2,7)
A.op('getlocal_0');A.op('pushscope')
A.L('S')
A.op('getlocal_0');A.op('getlocal_1');A.op('callproperty',mP,1);A.op('setlocal_3')
parent(A,3,4)
A.op('getlocal',4);lastname(A,3);A.op('getproperty',mL);A.op('setlocal',5)
A.op('getlocal',5);A.op('getlocal',4);A.op('getlocal_2');A.op('callproperty',q('apply'),2);A.op('setlocal',6)
A.op('getlocal_0');A.op('getlocal',6);A.op('callproperty',mO,1);A.op('returnvalue')
A.L('T'); err_handler(A); A.try_('S','T','E')
add_method('aqwCall',2,A.build())
# aqwSet(path,valor)
A=M(2,5)
A.op('getlocal_0');A.op('pushscope')
A.L('S')
A.op('getlocal_0');A.op('getlocal_1');A.op('callproperty',mP,1);A.op('setlocal_3')
parent(A,3,4)
A.op('getlocal',4);lastname(A,3);A.op('getlocal_2');A.op('setproperty',mL)
A.op('pushtrue');A.op('returnvalue')
A.L('T'); err_handler(A); A.try_('S','T','E')
add_method('aqwSet',2,A.build())
# aqwKeys(path) -> Array de nomes (for-in)
A=M(1,7)
A.op('getlocal_0');A.op('pushscope')
A.L('S')
A.op('getlocal_0');A.op('getlocal_1');A.op('callproperty',mP,1);A.op('setlocal_2')
A.op('getlocal_0');A.op('getlocal_2');A.op('getlocal_2');LEN(A);A.op('callproperty',mW,2);A.op('setlocal_3')
A.op('newarray',0);A.op('setlocal',4)
A.op('getlocal_3');A.op('pushnull');A.op('ifne','N');A.op('getlocal',4);A.op('returnvalue')
A.L('N');A.op('getlocal_3');A.op('setlocal',5);A.op('pushbyte',0);A.op('setlocal',6)
A.op('jump','Lc')
A.L('Lb');A.op('label')
A.op('getlocal',4);A.op('getlocal',5);A.op('getlocal',6);A.op('nextname');A.op('callpropvoid',q('push'),1)
A.L('Lc');A.op('hasnext2',5,6);A.op('iftrue','Lb')
A.op('getlocal',4);A.op('returnvalue')
A.L('T'); err_handler(A); A.try_('S','T','E')
add_method('aqwKeys',1,A.build())
# aqwDescribe(path) -> XML em texto
dt=QN('describeType',FLASH_UTILS_NS)
A=M(1,4)
A.op('getlocal_0');A.op('pushscope')
A.L('S')
A.op('getlocal_0');A.op('getlocal_1');A.op('callproperty',mP,1);A.op('setlocal_2')
A.op('getlocal_0');A.op('getlocal_2');A.op('getlocal_2');LEN(A);A.op('callproperty',mW,2);A.op('setlocal_3')
A.op('findpropstrict',dt);A.op('getlocal_3');A.op('callproperty',dt,1);A.op('callproperty',q('toXMLString'),0);A.op('returnvalue')
A.L('T'); err_handler(A); A.try_('S','T','E')
add_method('aqwDescribe',1,A.build())
# aqwPing()
A=M(0,1)
A.op('getlocal_0');A.op('pushscope');A.op('pushstring',S('aqw1'));A.op('returnvalue')
add_method('aqwPing',0,A.build())
# aqwInstall(): registra os callbacks (com trace de diagnostico)
TR=q('trace')
def tr(A,txt):
    A.op('findpropstrict',TR);A.op('pushstring',S(txt));A.op('callpropvoid',TR,1)
A=M(0,1)
A.op('getlocal_0');A.op('pushscope')
A.L('S')
tr(A,'AQWMOD install start')
for nm in ('aqwGet','aqwSet','aqwCall','aqwKeys','aqwDescribe','aqwPing'):
    A.op('getlex',EI);A.op('pushstring',S(nm));A.op('getlocal_0');A.op('getproperty',q(nm));A.op('callpropvoid',ADDCB,2)
tr(A,'AQWMOD install ok')
A.op('returnvoid')
A.L('T'); A.L('E')
A.op('findpropstrict',TR);A.op('swap');A.op('pushstring',S('AQWMOD install erro:'));A.op('swap');A.op('add')
A.op('callpropvoid',TR,1)
A.op('returnvoid'); A.try_('S','T','E')
add_method('aqwInstall',0,A.build())
# acrescenta traits de metodo na classe Game
for name,idx in new:
    G['traits'].append(dict(name=q(name),kind=1,attr=0,disp=0,method=idx))
# gancho: no inicio de Game.onAddedToStage
mnb=__import__('swf').w30(q('aqwInstall'))
k=3+len(mnb)
w30_=__import__('swf').w30
mnb=w30_(q('aqwInstall')); mt=w30_(TR)
k=3+len(mnb)
handler=bytes([0x5D])+mt+bytes([0x2B,0x2C])+w30_(S('AQWMOD hook erro:'))+bytes([0x2B,0xA0,0x4F])+mt+bytes([1])
pre=bytes([0xD0,0x4F])+mnb+bytes([0, 0x10])+(len(handler)).to_bytes(3,'little')+handler
hb['code']=pre+hb['code']
hb['exc']=[(0,k,k+4,0,0)]
hb['maxstack']=max(hb['maxstack'],2)
ab=abcp.write(a)
# remonta o SWF
pos=tg[1]+tg[2]
head=bytes(b[:tg[1]]); 
tag_hdr=struct.pack('<HI',(82<<6)|63,4+ (p-pos-4) + len(ab))
newb=head+tag_hdr+bytes(b[pos:p])+ab+bytes(b[tg[1]+tg[2]+tg[3]:])
newb=newb[:4]+struct.pack('<I',len(newb))+newb[8:]
out=b'CWS'+newb[3:8]+zlib.compress(newb[8:],9)
open(OUT,'wb').write(out)
print('ok',len(out),'abc',len(ab),'novos metodos',len(new))
