import struct,zlib
class R:
    def __init__(s,b,p=0): s.b=b;s.p=p
    def u8(s): v=s.b[s.p]; s.p+=1; return v
    def u16(s): v=struct.unpack_from('<H',s.b,s.p)[0]; s.p+=2; return v
    def u30(s):
        r=0;sh=0
        while True:
            x=s.b[s.p]; s.p+=1; r|=(x&0x7f)<<sh; sh+=7
            if not x&0x80: break
        return r
    def d64(s): v=s.b[s.p:s.p+8]; s.p+=8; return v
    def raw(s,n): v=s.b[s.p:s.p+n]; s.p+=n; return v
def w30(v):
    v&=0xffffffff; o=bytearray()
    while True:
        x=v&0x7f; v>>=7
        if v: o.append(x|0x80)
        else: o.append(x); break
    return bytes(o)
def load_swf(path):
    d=open(path,'rb').read()
    if d[:3]==b'CWS': b=d[:8]+zlib.decompress(d[8:])
    elif d[:3]==b'FWS': b=d
    else: raise Exception('fmt '+repr(d[:3]))
    nb=b[8]>>3; rl=(5+4*nb+7)//8
    pos=8+rl+4; tags=[]
    while pos<len(b):
        h=struct.unpack('<H',b[pos:pos+2])[0]; code=h>>6; ln=h&63; hs=2
        if ln==63: ln=struct.unpack('<I',b[pos+2:pos+6])[0]; hs=6
        tags.append((code,pos,hs,ln)); pos+=hs+ln
        if code==0: break
    return b,tags
