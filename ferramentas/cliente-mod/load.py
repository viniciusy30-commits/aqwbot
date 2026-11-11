import sys; sys.path.insert(0,'.')
from swf import *; import abcp, dis
def load(path='./Game4000r8.swf'):
    b,t=load_swf(path)
    tg=[x for x in t if x[0]==82][0]
    pos=tg[1]+tg[2]; p=pos+4; e=b.index(b'\0',p); p=e+1
    a=abcp.parse(b,p)
    return b,t,tg,p,a
def cls(a,name):
    for i,x in enumerate(a.inst):
        if abcp.mname(a,x['name'])==name: return i
bodyof=lambda a,m:[d for d in a.bodies if d['method']==m][0]
