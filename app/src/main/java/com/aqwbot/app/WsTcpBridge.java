package com.aqwbot.app;

import android.util.Base64;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

/**
 * Ponte WebSocket -> TCP, so em 127.0.0.1.
 * O Ruffle na web nao abre socket TCP puro; ele abre um WebSocket neste servidor
 * (ws://127.0.0.1:PORTA/TOKEN/host:porta) e a ponte repassa os bytes ao servidor do jogo.
 * O TOKEN aleatorio impede que outros apps do celular usem a ponte.
 */
public class WsTcpBridge {

    public interface Logger {
        void log(String msg);
    }

    private static final String GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    private static final int MAX_FRAME = 16 * 1024 * 1024;

    private final Logger logger;
    private volatile boolean running = false;
    private ServerSocket server;
    private int port = 0;
    private String token = "";

    public WsTcpBridge(Logger logger) {
        this.logger = logger;
    }

    public synchronized void start() throws IOException {
        if (running) return;
        byte[] raw = new byte[16];
        new SecureRandom().nextBytes(raw);
        StringBuilder sb = new StringBuilder();
        for (byte b : raw) sb.append(String.format("%02x", b));
        token = sb.toString();

        server = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
        port = server.getLocalPort();
        running = true;

        final ServerSocket s = server;
        Thread acceptor = new Thread(new Runnable() {
            @Override
            public void run() {
                while (running) {
                    try {
                        final Socket c = s.accept();
                        Thread h = new Thread(new Runnable() {
                            @Override
                            public void run() {
                                handle(c);
                            }
                        });
                        h.setDaemon(true);
                        h.start();
                    } catch (IOException e) {
                        if (running) log("accept: " + e.getMessage());
                    }
                }
            }
        });
        acceptor.setDaemon(true);
        acceptor.start();
    }

    public synchronized void stop() {
        running = false;
        try {
            if (server != null) server.close();
        } catch (IOException ignored) {
        }
    }

    public int getPort() {
        return port;
    }

    public String getToken() {
        return token;
    }

    private void log(String m) {
        if (logger != null) logger.log("bridge: " + m);
    }

    private void handle(Socket c) {
        Socket target = null;
        try {
            c.setSoTimeout(10000);
            InputStream in = new BufferedInputStream(c.getInputStream());
            final OutputStream out = new BufferedOutputStream(c.getOutputStream());

            String head = readHead(in);
            if (head == null) return;
            String[] lines = head.split("\r\n");
            String[] req = lines[0].split(" ");
            if (req.length < 2) return;
            String path = req[1];

            String key = null;
            for (String l : lines) {
                if (l.regionMatches(true, 0, "Sec-WebSocket-Key:", 0, 18)) {
                    key = l.substring(18).trim();
                }
            }
            String[] parts = path.startsWith("/") ? path.substring(1).split("/") : path.split("/");
            if (key == null || parts.length != 2 || !parts[0].equals(token)) {
                out.write("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                        .getBytes(StandardCharsets.US_ASCII));
                out.flush();
                return;
            }
            String hp = parts[1];
            int idx = hp.lastIndexOf(':');
            if (idx <= 0) return;
            String host = hp.substring(0, idx);
            int tport;
            try {
                tport = Integer.parseInt(hp.substring(idx + 1));
            } catch (NumberFormatException e) {
                return;
            }

            MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
            byte[] digest = sha1.digest((key + GUID).getBytes(StandardCharsets.US_ASCII));
            String accept = Base64.encodeToString(digest, Base64.NO_WRAP);
            out.write(("HTTP/1.1 101 Switching Protocols\r\n"
                    + "Upgrade: websocket\r\n"
                    + "Connection: Upgrade\r\n"
                    + "Sec-WebSocket-Accept: " + accept + "\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            out.flush();

            target = new Socket();
            target.connect(new InetSocketAddress(host, tport), 10000);
            target.setTcpNoDelay(true);
            c.setSoTimeout(0);
            log("conectado a " + host + ":" + tport);

            final Socket t = target;
            final Socket client = c;
            final InputStream tin = t.getInputStream();
            Thread pump = new Thread(new Runnable() {
                @Override
                public void run() {
                    byte[] buf = new byte[8192];
                    try {
                        while (true) {
                            int n = tin.read(buf);
                            if (n < 0) break;
                            sendFrame(out, 0x2, buf, n);
                        }
                    } catch (IOException ignored) {
                    }
                    closeQuietly(client);
                    closeQuietly(t);
                }
            });
            pump.setDaemon(true);
            pump.start();

            OutputStream tout = t.getOutputStream();
            while (true) {
                int b0 = in.read();
                if (b0 < 0) break;
                int b1 = in.read();
                if (b1 < 0) break;
                int op = b0 & 0x0F;
                boolean masked = (b1 & 0x80) != 0;
                long len = b1 & 0x7F;
                if (len == 126) {
                    len = (readByte(in) << 8) | readByte(in);
                } else if (len == 127) {
                    len = 0;
                    for (int i = 0; i < 8; i++) len = (len << 8) | readByte(in);
                }
                if (len < 0 || len > MAX_FRAME) break;
                byte[] mask = new byte[4];
                if (masked) readFully(in, mask, 4);
                byte[] payload = new byte[(int) len];
                readFully(in, payload, payload.length);
                if (masked) {
                    for (int i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
                }
                if (op == 0x0 || op == 0x1 || op == 0x2) {
                    tout.write(payload);
                    tout.flush();
                } else if (op == 0x8) {
                    break;
                } else if (op == 0x9) {
                    sendFrame(out, 0xA, payload, payload.length);
                }
            }
        } catch (Exception e) {
            log("erro: " + e.getClass().getSimpleName() + " " + e.getMessage());
        } finally {
            closeQuietly(target);
            closeQuietly(c);
        }
    }

    private static void sendFrame(OutputStream o, int op, byte[] d, int n) throws IOException {
        synchronized (o) {
            o.write(0x80 | op);
            if (n < 126) {
                o.write(n);
            } else if (n < 65536) {
                o.write(126);
                o.write((n >> 8) & 0xFF);
                o.write(n & 0xFF);
            } else {
                o.write(127);
                for (int i = 7; i >= 0; i--) o.write((int) (((long) n >> (8 * i)) & 0xFF));
            }
            o.write(d, 0, n);
            o.flush();
        }
    }

    private static String readHead(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        while (sb.length() < 8192) {
            int b = in.read();
            if (b < 0) return null;
            sb.append((char) b);
            int n = sb.length();
            if (n >= 4 && sb.charAt(n - 4) == '\r' && sb.charAt(n - 3) == '\n'
                    && sb.charAt(n - 2) == '\r' && sb.charAt(n - 1) == '\n') {
                return sb.substring(0, n - 4);
            }
        }
        return null;
    }

    private static int readByte(InputStream in) throws IOException {
        int b = in.read();
        if (b < 0) throw new EOFException();
        return b;
    }

    private static void readFully(InputStream in, byte[] b, int n) throws IOException {
        int off = 0;
        while (off < n) {
            int r = in.read(b, off, n - off);
            if (r < 0) throw new EOFException();
            off += r;
        }
    }

    private static void closeQuietly(Socket s) {
        try {
            if (s != null) s.close();
        } catch (IOException ignored) {
        }
    }
}
