// =====================================================================
//  PAINT BATTLE BOT  --  v3
//
//  Protocol
//    input : GAME R C U V T known
//            [MAP + R rows]                     (only when known == 1)
//            ROUND round our_cells
//              UNIT id r c  +  (2V+1) rows of (2V+1) chars    (once per unit)
//            ...
//            GAME_END points
//    output: ORDERS d1 d2 ... dU                  d in {N,E,S,W,H}
//
//  View characters: '#' wall, '.' empty, '+' ours, '-' enemy,
//                   'M' our unit, 'E' enemy unit
//
//  ---------------------------------------------------------------
//  THE SCORE IS A RATIO, NOT A MARGIN
//      points = 5 * (our cells) / (their cells),  capped at 10
//  so 10 vs 10 is only 5.0/10 and you need 2:1 to score full marks.
//  Every decision below is made in those terms: taking one of their
//  cells is worth 1 + A/B of ours, because it also shrinks their pile.
//  ---------------------------------------------------------------
//
//  How it plays
//   1. belief   - terrain, owner and "how long ago did I see this"
//                 for every cell.
//   2. threat   - multi source BFS from every enemy sighting gives the
//                 round in which the enemy could first reach a cell.
//   3. value    - expected score of painting a cell at a given round,
//                 discounted by the chance they take it back.
//                 Our own stale cells are worth re-checking.
//   4. search   - joint beam search over all our units to the end of the
//                 game, so they never collide, never swap and never race
//                 for the same cell.
// =====================================================================
#include <bits/stdc++.h>
using namespace std;

/* ------------------------------ tunables ----------------------------- */
#ifndef W_NEUTRAL
#define W_NEUTRAL 1.0        // weight of gaining one cell
#endif
#ifndef DENIAL
#define DENIAL 0.5           // extra value for taking a cell they would claim
#endif
#ifndef NEUTRAL_LOSS
#define NEUTRAL_LOSS 1.0     // cost of an empty cell that they take back
#endif
#ifndef P_STAY
#define P_STAY 0.80          // chance a contested cell is still ours at the end
#endif
#ifndef W_STALE
#define W_STALE 0.5          // how suspicious we are of our own old cells
#endif
#ifndef STALE_AGE
#define STALE_AGE 2          // rounds before a friendly cell feels unsafe
#endif
#ifndef STALE_TAU
#define STALE_TAU 6.0        // rounds to reach the full stale value
#endif
#ifndef W_FOG
#define W_FOG 0.30           // bonus for revealing unknown terrain
#endif
#ifndef BEAM_W
#define BEAM_W 16            // beam width
#endif
#ifndef MAXD
#define MAXD 12              // search horizon in rounds
#endif
#ifndef GAMMA
#define GAMMA 0.995          // per step discount
#endif
#ifndef POT_W
#define POT_W 0.004          // pull towards profit when nothing is reachable
#endif
#ifndef RATIO_LO
#define RATIO_LO 0.40        // clamp on the estimated A/B
#endif
#ifndef RATIO_HI
#define RATIO_HI 3.00
#endif

static const int MAXU = 8;
static const int INF = 1000000000;

static const int DR[5] = {-1, 0, 1, 0, 0};
static const int DC[5] = {0, 1, 0, -1, 0};
static const char DIR_CHAR[5] = {'N', 'E', 'S', 'W', 'H'};

enum { T_UNKNOWN = 0, T_OPEN = 1, T_WALL = 2 };
enum { P_UNKNOWN = 0, P_NONE = 1, P_OURS = 2, P_ENEMY = 3 };

/* -------------------------------- state ------------------------------ */
static int R, C, U, V, T, knownF;
static vector<unsigned char> terr, pnt, enemyNow;
static vector<int> seenAt;
static int roundNo = 0, ourCellCount = 0;

struct MyUnit { int r = -1, c = -1, prev_r = -1, prev_c = -1, lastOrd = 4; };
static vector<MyUnit> mine;

static bool symOk = true;              // board looks 180-degree symmetric
static vector<int> priorSrc;           // where the enemy probably started
static unordered_map<int, int> sightings;

static inline int IDX(int r, int c) { return r * C + c; }
static inline bool inB(int r, int c) { return r >= 0 && r < R && c >= 0 && c < C; }

static vector<int> bfsFrom(int src) {
    vector<int> d(R * C, INF);
    if (src < 0) return d;
    vector<int> q(R * C);
    int qh = 0, qt = 0;
    d[src] = 0;
    q[qt++] = src;
    while (qh < qt) {
        int cur = q[qh++];
        int r = cur / C, c = cur % C;
        int nd = d[cur] + 1;
        for (int k = 0; k < 4; ++k) {
            int nr = r + DR[k], nc = c + DC[k];
            if (!inB(nr, nc)) continue;
            int ni = IDX(nr, nc);
            if (terr[ni] == T_WALL) continue;
            if (d[ni] > nd) { d[ni] = nd; q[qt++] = ni; }
        }
    }
    return d;
}

static vector<int> bfsMulti(const vector<int>& srcs) {
    vector<int> d(R * C, INF);
    vector<int> q(R * C);
    int qh = 0, qt = 0;
    for (int s : srcs) {
        if (s < 0 || s >= R * C || d[s] == 0) continue;
        d[s] = 0;
        q[qt++] = s;
    }
    while (qh < qt) {
        int cur = q[qh++];
        int r = cur / C, c = cur % C;
        int nd = d[cur] + 1;
        for (int k = 0; k < 4; ++k) {
            int nr = r + DR[k], nc = c + DC[k];
            if (!inB(nr, nc)) continue;
            int ni = IDX(nr, nc);
            if (terr[ni] == T_WALL) continue;
            if (d[ni] > nd) { d[ni] = nd; q[qt++] = ni; }
        }
    }
    return d;
}

/* ------------------------------ beam node ---------------------------- */
static int maskWords(int cells) { return (cells + 63) / 64; }

struct Node {
    int pos[MAXU];
    vector<unsigned long long> mask;   // cells this plan already painted
    double score, pot;
    unsigned char first[MAXU];
};

static inline double keyOf(const Node& n) { return n.score + n.pot; }
static inline bool maskTest(const vector<unsigned long long>& m, int cell) {
    int w = cell >> 6;
    if (w >= (int)m.size()) return false;
    return (m[w] >> (cell & 63)) & 1ULL;
}
static inline void maskSet(vector<unsigned long long>& m, int cell) {
    int w = cell >> 6;
    if (w >= (int)m.size()) return;
    m[w] |= (1ULL << (cell & 63));
}
static inline int dirOf(int fromCell, int toCell) {
    int fr = fromCell / C, fc = fromCell % C;
    int tr = toCell / C, tc = toCell % C;
    for (int d = 0; d < 5; ++d)
        if (fr + DR[d] == tr && fc + DC[d] == tc) return d;
    return 4;
}

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);

    string cmd;
    if (!(cin >> cmd) || cmd != "GAME") return 0;
    cin >> R >> C >> U >> V >> T >> knownF;
    if (R <= 0 || C <= 0 || U <= 0 || T <= 0) return 0;
    if (U > MAXU) U = MAXU;

    int NC = R * C;
    terr.assign(NC, T_UNKNOWN);
    pnt.assign(NC, P_UNKNOWN);
    enemyNow.assign(NC, 0);
    seenAt.assign(NC, -1000);

    if (knownF == 1) {
        string tag;
        cin >> tag;
        for (int r = 0; r < R; ++r) {
            string s;
            cin >> s;
            for (int c = 0; c < C; ++c)
                terr[IDX(r, c)] = (c < (int)s.size() && s[c] == '#') ? T_WALL : T_OPEN;
        }
        for (int r = 0; r < R && symOk; ++r)
            for (int c = 0; c < C; ++c)
                if (terr[IDX(r, c)] != terr[IDX(R - 1 - r, C - 1 - c)]) { symOk = false; break; }
    }

    mine.resize(U);

    while (cin >> cmd) {
        if (cmd == "GAME_END") { double p; cin >> p; break; }
        if (cmd != "ROUND") break;

        int dummy = 0;
        cin >> roundNo >> dummy;
        ourCellCount = dummy;

        fill(enemyNow.begin(), enemyNow.end(), 0);

        /* ------------------------- read the round ------------------------- */
        for (int i = 0; i < U; ++i) {
            string utag;
            int id, r, c;
            cin >> utag >> id >> r >> c;
            if (id < 0 || id >= U) id = i;

            MyUnit& u = mine[id];
            u.prev_r = r; u.prev_c = c;
            u.r = r; u.c = c;

            if (roundNo == 1 && inB(r, c)) {
                terr[IDX(r, c)] = T_OPEN;
                pnt[IDX(r, c)] = P_OURS;
                int mr = R - 1 - r, mc = C - 1 - c;
                if (inB(mr, mc)) {
                    priorSrc.push_back(IDX(mr, mc));
                    if (pnt[IDX(mr, mc)] == P_UNKNOWN) pnt[IDX(mr, mc)] = P_ENEMY;
                }
            }

            int n = 2 * V + 1;
            vector<string> rows(n);
            for (int k = 0; k < n; ++k) cin >> rows[k];

            for (int dr = -V; dr <= V; ++dr) {
                int nr = r + dr;
                if (nr < 0 || nr >= R) continue;
                const string& row = rows[dr + V];
                for (int dc = -V; dc <= V; ++dc) {
                    int nc = c + dc;
                    if (nc < 0 || nc >= C) continue;
                    int j = dc + V;
                    if (j < 0 || j >= (int)row.size()) continue;
                    char ch = row[j];
                    int cell = IDX(nr, nc);
                    seenAt[cell] = roundNo;
                    if (ch == '#') {
                        terr[cell] = T_WALL;
                        int mi = IDX(R - 1 - nr, C - 1 - nc);
                        if (terr[mi] != T_UNKNOWN && terr[mi] != T_WALL) symOk = false;
                        continue;
                    }
                    terr[cell] = T_OPEN;
                    if (terr[IDX(R - 1 - nr, C - 1 - nc)] == T_WALL) symOk = false;
                    if (ch == '.') pnt[cell] = P_NONE;
                    else if (ch == '+' || ch == 'M') pnt[cell] = P_OURS;
                    else {
                        pnt[cell] = P_ENEMY;
                        if (ch == 'E') {
                            enemyNow[cell] = 1;
                            sightings[cell] = roundNo;
                        }
                    }
                }
            }
        }

        /* ---------------------- enemy travel time field ------------------- */
        vector<double> threat(NC, (double)INF);
        {
            vector<pair<int, int>> srcs;             // cell, rounds since seen
            for (auto& kv : sightings) {
                int age = roundNo - kv.second;
                if (age <= 10) srcs.push_back({kv.first, age});
            }
            if (srcs.empty() && symOk && !priorSrc.empty())
                for (int s : priorSrc) srcs.push_back({s, max(0, roundNo - 1)});

            for (auto& s : srcs) {
                vector<int> d = bfsFrom(s.first);
                for (int i = 0; i < NC; ++i)
                    if (d[i] < INF) {
                        double v = (double)d[i] - (double)s.second;
                        if (v < 0) v = 0;
                        if (v < threat[i]) threat[i] = v;
                    }
            }
        }

        /* ---------------------- ratio-aware cell weights ------------------ */
        /* score = 5A/B  =>  gaining a cell is worth 1/B, denying one A/B^2,
           so a denied cell is worth A/B cells gained.                       */
        double W_GAIN = W_NEUTRAL;
        double W_DENY = W_NEUTRAL;
        {
            int bEst = 0;
            for (int i = 0; i < NC; ++i) if (pnt[i] == P_ENEMY) bEst++;
            if (bEst <= 0) bEst = ourCellCount > 0 ? ourCellCount : 1;
            double ratio = (double)ourCellCount / (double)max(1, bEst);
            if (ratio < RATIO_LO) ratio = RATIO_LO;
            if (ratio > RATIO_HI) ratio = RATIO_HI;
            W_GAIN = W_NEUTRAL;
            W_DENY = W_NEUTRAL * ratio;
            double sc = (W_GAIN + W_DENY) * 0.5;
            double norm = sc * 0.5 + 0.5;                // keep the tuned scale
            W_GAIN /= norm;
            W_DENY /= norm;
        }

        /* --------------------------- value table -------------------------- */
        int D = T - roundNo + 1;
        if (D < 1) D = 1;
        if (D > MAXD) D = MAXD;

        vector<vector<float>> V(D + 1, vector<float>(NC, 0.f));
        vector<int> valued;
        for (int s = 1; s <= D; ++s) {
            int t = roundNo + s - 1;          // round we would arrive
            int rem = T - t;                  // rounds left afterwards
            double disc = pow(GAMMA, (double)(s - 1));
            for (int cell = 0; cell < NC; ++cell) {
                if (terr[cell] == T_WALL) continue;
                int p = pnt[cell];

                double ed = threat[cell] - (double)(t - roundNo);
                if (ed < 0) ed = 0;
                double pStay = 1.0;
                if (rem > 0 && ed <= (double)rem) pStay = P_STAY;

                double v;
                if (p == P_ENEMY) {
                    v = (W_GAIN + W_DENY) * pStay;
                } else if (p == P_NONE || p == P_UNKNOWN) {
                    double contest = (rem > 0) ? exp(-ed / 2.0) : 1.0;
                    v = (W_NEUTRAL + DENIAL * contest) * pStay
                        - NEUTRAL_LOSS * W_DENY * (1.0 - pStay);
                } else {
                    int age = roundNo - seenAt[cell];
                    if (age < STALE_AGE) continue;
                    double pFlip = W_STALE * min(1.0, (double)age / STALE_TAU);
                    v = (W_GAIN + W_DENY) * pFlip * pStay;
                }
                if (terr[cell] == T_UNKNOWN) v += W_FOG;
                if (v <= 0.001) continue;
                V[s][cell] = (float)(v * disc);
                if (s == 1) valued.push_back(cell);
            }
        }

        /* potential: pull units towards the nearest profitable cell */
        vector<float> pot(NC, 0.f);
        {
            vector<int> dv = bfsMulti(valued);
            for (int i = 0; i < NC; ++i) {
                int d = dv[i];
                if (d >= INF || d > 40) d = 40;
                pot[i] = (float)(-POT_W * (double)d);
            }
        }

        /* --------------------------- beam search -------------------------- */
        int perUnitCap = (U <= 2 ? 5 : (U == 3 ? 4 : 3));
        int beamW = BEAM_W;
        if (U >= 6) beamW = max(4, BEAM_W / 4);        // keep the clock safe
        int mw = maskWords(NC);

        vector<Node> beam, nxt;
        beam.reserve(beamW * 8);
        nxt.reserve(beamW * 8);

        Node root;
        root.mask.assign(mw, 0ULL);
        root.score = 0.0;
        root.pot = 0.0;
        for (int u = 0; u < U; ++u) {
            root.pos[u] = IDX(mine[u].r, mine[u].c);
            root.first[u] = 4;
            maskSet(root.mask, root.pos[u]);
            root.pot += pot[root.pos[u]];
        }
        beam.push_back(root);

        for (int step = 0; step < D; ++step) {
            const vector<float>& Vc = V[step + 1];
            bool anyValue = false;
            for (int i = 0; i < NC; ++i) if (Vc[i] > 0.f) { anyValue = true; break; }
            if (!anyValue) break;

            nxt.clear();
            for (size_t bi = 0; bi < beam.size(); ++bi) {
                const Node& nd = beam[bi];

                int opt[MAXU][5], nopt[MAXU];
                for (int u = 0; u < U; ++u) {
                    int cand[5], nc2 = 0;
                    double cval[5];
                    int r = nd.pos[u] / C, c = nd.pos[u] % C;
                    for (int d = 0; d < 5; ++d) {
                        int nr = r + DR[d], nc = c + DC[d];
                        if (!inB(nr, nc)) continue;
                        int ni = IDX(nr, nc);
                        if (terr[ni] == T_WALL) continue;
                        cand[nc2] = ni;
                        cval[nc2] = (d == 4) ? 0.0 : (double)Vc[ni];
                        nc2++;
                    }
                    if (nc2 == 0) { cand[nc2] = nd.pos[u]; cval[nc2] = 0.0; nc2++; }
                    if (nc2 > perUnitCap) {
                        for (int a = 0; a < nc2; ++a)
                            for (int b = a + 1; b < nc2; ++b)
                                if (cval[b] > cval[a]) {
                                    swap(cval[a], cval[b]);
                                    swap(cand[a], cand[b]);
                                }
                        nc2 = perUnitCap;
                    }
                    nopt[u] = nc2;
                    for (int k = 0; k < nc2; ++k) opt[u][k] = cand[k];
                }

                int cur[MAXU];
                auto rec = [&](auto&& self, int u) -> void {
                    if (u == U) {
                        for (int a = 0; a < U; ++a)
                            for (int b = a + 1; b < U; ++b) {
                                if (cur[a] == cur[b]) return;
                                if (cur[a] == nd.pos[b] && cur[b] == nd.pos[a]) return;
                            }
                        Node ch = nd;
                        double add = 0.0;
                        ch.pot = 0.0;
                        for (int a = 0; a < U; ++a) {
                            ch.pos[a] = cur[a];
                            ch.pot += pot[cur[a]];
                            if (cur[a] == nd.pos[a]) continue;
                            float v = Vc[cur[a]];
                            if (v > 0.f && !maskTest(ch.mask, cur[a])) {
                                add += v;
                                maskSet(ch.mask, cur[a]);
                            }
                        }
                        ch.score = nd.score + add;
                        if (step == 0)
                            for (int a = 0; a < U; ++a)
                                ch.first[a] = (unsigned char)dirOf(nd.pos[a], cur[a]);
                        nxt.push_back(ch);
                        return;
                    }
                    for (int k = 0; k < nopt[u]; ++k) { cur[u] = opt[u][k]; self(self, u + 1); }
                };
                rec(rec, 0);
            }

            if (nxt.empty()) break;
            if ((int)nxt.size() > beamW) {
                nth_element(nxt.begin(), nxt.begin() + beamW, nxt.end(),
                            [](const Node& a, const Node& b) { return keyOf(a) > keyOf(b); });
                nxt.resize(beamW);
            }
            beam.swap(nxt);
        }

        /* ------------------------------ output ---------------------------- */
        int chosen[MAXU];
        for (int u = 0; u < U; ++u) chosen[u] = 4;

        if (!beam.empty()) {
            size_t bi = 0;
            for (size_t i = 1; i < beam.size(); ++i)
                if (keyOf(beam[i]) > keyOf(beam[bi])) bi = i;
            for (int u = 0; u < U; ++u) {
                int b = beam[bi].first[u];
                chosen[u] = (b >= 0 && b < 5) ? b : 4;
            }
        }

        /* hard safety: never send an impossible or duplicated move */
        for (int u = 0; u < U; ++u) {
            int nr = mine[u].r + DR[chosen[u]], nc = mine[u].c + DC[chosen[u]];
            if (!inB(nr, nc) || terr[IDX(nr, nc)] == T_WALL) chosen[u] = 4;
        }
        for (int a = 0; a < U; ++a)
            for (int b = a + 1; b < U; ++b) {
                int ar = mine[a].r + DR[chosen[a]], ac = mine[a].c + DC[chosen[a]];
                int br = mine[b].r + DR[chosen[b]], bc = mine[b].c + DC[chosen[b]];
                if (ar == br && ac == bc) chosen[b] = 4;
            }

        cout << "ORDERS";
        for (int u = 0; u < U; ++u) cout << " " << DIR_CHAR[chosen[u]];
        cout << "\n" << flush;

        for (int u = 0; u < U; ++u) mine[u].lastOrd = chosen[u];
    }
    return 0;
}
