// =====================================================================
//  PAINT BATTLE BOT  --  v2
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
//  How it plays
//  ------------
//  1. belief   - keep terrain, owner and age of every observation.
//  2. threat   - for every cell, an estimate of how many rounds the enemy
//                needs to get there (multi source BFS from every sighting,
//                aged by the time since it was seen).
//  3. value    - the expected score change of painting a cell now:
//                  enemy cell  : +2 if they do not take it back
//                  empty cell  : +1 if we keep it, -1 if they take it back
//                                plus a bonus for denying it to them
//                  our own cell: worth re-checking once the observation is old
//                "do they take it back" is modelled with pStay, which depends
//                on whether the enemy can physically arrive before the end.
//  4. search   - a joint beam search over all our units to the end of the
//                game. It never lets two units target the same cell or swap,
//                so our own units never block each other.
// =====================================================================
#include <bits/stdc++.h>
using namespace std;

/* ------------------------------ tunables ----------------------------- */
#ifndef W_ENEMY
#define W_ENEMY 2.0            // flip an enemy cell: +1 for us, -1 for them
#endif
#ifndef W_NEUTRAL
#define W_NEUTRAL 1.0          // paint an empty cell
#endif
#ifndef DENIAL
#define DENIAL 0.5             // extra value for denying a cell they would claim
#endif
#ifndef NEUTRAL_LOSS
#define NEUTRAL_LOSS 1.0       // loss when they take a painted empty cell back
#endif
#ifndef P_STAY
#define P_STAY 0.65            // chance a contested cell is still ours at the end
#endif
#ifndef W_STALE
#define W_STALE 0.5            // how suspicious we are of our own old cells
#endif
#ifndef STALE_AGE
#define STALE_AGE 2            // rounds before a friendly cell feels unsafe
#endif
#ifndef STALE_TAU
#define STALE_TAU 6.0          // rounds to reach the full stale value
#endif
#ifndef W_FOG
#define W_FOG 0.30             // bonus for revealing unknown terrain
#endif
#ifndef RISK_ENEMY_UNIT
#define RISK_ENEMY_UNIT 0.15   // enemy unit standing there: the move usually fails
#endif
#ifndef BLOCK_PENALTY
#define BLOCK_PENALTY 0.35     // this cell blocked us last round
#endif
#ifndef BEAM_W
#define BEAM_W 16              // beam width
#endif
#ifndef MAXD
#define MAXD 8                 // search horizon (rounds)
#endif
#ifndef GAMMA
#define GAMMA 0.995            // per step discount
#endif
#ifndef POT_W
#define POT_W 0.004            // "walk towards value" potential
#endif

static const int MAXU = 8;
static const int MAXW = 8;     // 512 mask bits (plenty for normal boards)
static const int INF = 1000000000;

static const int DR[5] = {-1, 0, 1, 0, 0};
static const int DC[5] = {0, 1, 0, -1, 0};
static const char DIR_CHAR[5] = {'N', 'E', 'S', 'W', 'H'};

enum { T_UNKNOWN = 0, T_OPEN = 1, T_WALL = 2 };
enum { P_UNKNOWN = 0, P_NONE = 1, P_OURS = 2, P_ENEMY = 3 };

/* -------------------------------- state ------------------------------ */
static int R, C, U, V, T, knownF;
static vector<unsigned char> terr_, pnt_, enemyNow;
static vector<int> seenAt;

struct MyUnit {
    int r = -1, c = -1;
    int prev_r = -1, prev_c = -1;
    int lastOrd = 4;
    int blockCell = -1;
};
static vector<MyUnit> mine;

static int roundNo = 0;
static bool symOk = true;              // map looks 180-degree rotation symmetric
static vector<int> priorSrc;           // guess where the enemy started
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
            if (terr_[ni] == T_WALL) continue;
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
            if (terr_[ni] == T_WALL) continue;
            if (d[ni] > nd) { d[ni] = nd; q[qt++] = ni; }
        }
    }
    return d;
}

/* ------------------------------ beam node ---------------------------- */
struct Node {
    int pos[MAXU];
    array<uint64_t, MAXW> mask;   // cells this plan has already painted
    double score;
    double pot;
    unsigned char first[MAXU];    // first move of the plan, per unit
};

static inline double keyOf(const Node& n) { return n.score + n.pot; }

static inline bool maskTest(const array<uint64_t, MAXW>& m, int cell) {
    int w = cell >> 6;
    if (w >= MAXW) return false;
    return (m[w] >> (cell & 63)) & 1ULL;
}
static inline void maskSet(array<uint64_t, MAXW>& m, int cell) {
    int w = cell >> 6;
    if (w >= MAXW) return;
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

    terr_.assign(R * C, T_UNKNOWN);
    pnt_.assign(R * C, P_UNKNOWN);
    enemyNow.assign(R * C, 0);
    seenAt.assign(R * C, -1000);

    if (knownF == 1) {
        string tag;
        cin >> tag;
        for (int r = 0; r < R; ++r) {
            string s;
            cin >> s;
            for (int c = 0; c < C; ++c)
                terr_[IDX(r, c)] = (c < (int)s.size() && s[c] == '#') ? T_WALL : T_OPEN;
        }
        for (int r = 0; r < R && symOk; ++r)
            for (int c = 0; c < C; ++c)
                if (terr_[IDX(r, c)] != terr_[IDX(R - 1 - r, C - 1 - c)]) { symOk = false; break; }
    }

    mine.resize(U);

    while (cin >> cmd) {
        if (cmd == "GAME_END") { double p; cin >> p; break; }
        if (cmd != "ROUND") break;

        int ourCells = 0;
        cin >> roundNo >> ourCells;

        fill(enemyNow.begin(), enemyNow.end(), 0);

        /* ------------------------- read the round ------------------------- */
        for (int i = 0; i < U; ++i) {
            string utag;
            int id, r, c;
            cin >> utag >> id >> r >> c;
            if (id < 0 || id >= U) id = i;

            MyUnit& u = mine[id];
            int newBlock = -1;
            if (roundNo > 1 && u.r >= 0 && u.lastOrd < 4) {
                int er = u.prev_r + DR[u.lastOrd];
                int ec = u.prev_c + DC[u.lastOrd];
                bool wantValid = inB(er, ec) && terr_[IDX(er, ec)] != T_WALL;
                if (r == u.prev_r && c == u.prev_c && wantValid) newBlock = IDX(er, ec);
            }
            u.blockCell = newBlock;
            u.prev_r = r; u.prev_c = c;
            u.r = r; u.c = c;

            if (roundNo == 1 && inB(r, c)) {
                terr_[IDX(r, c)] = T_OPEN;
                pnt_[IDX(r, c)] = P_OURS;
                int mr = R - 1 - r, mc = C - 1 - c;
                if (inB(mr, mc)) {
                    priorSrc.push_back(IDX(mr, mc));
                    if (pnt_[IDX(mr, mc)] == P_UNKNOWN) pnt_[IDX(mr, mc)] = P_ENEMY;
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
                        terr_[cell] = T_WALL;
                        int mi = IDX(R - 1 - nr, C - 1 - nc);
                        if (terr_[mi] != T_UNKNOWN && terr_[mi] != T_WALL) symOk = false;
                        continue;
                    }
                    terr_[cell] = T_OPEN;
                    if (terr_[IDX(R - 1 - nr, C - 1 - nc)] == T_WALL) symOk = false;
                    if (ch == '.') pnt_[cell] = P_NONE;
                    else if (ch == '+' || ch == 'M') pnt_[cell] = P_OURS;
                    else {
                        pnt_[cell] = P_ENEMY;
                        if (ch == 'E') {
                            enemyNow[cell] = 1;
                            sightings[cell] = roundNo;
                        }
                    }
                }
            }
        }

        /* ---------------------- enemy travel time field ------------------- */
        vector<double> threat(R * C, (double)INF);
        {
            vector<pair<int, int>> srcs;   // cell, rounds since seen
            for (auto& kv : sightings) {
                int age = roundNo - kv.second;
                if (age <= 10) srcs.push_back({kv.first, age});
            }
            if (srcs.empty() && symOk && !priorSrc.empty())
                for (int s : priorSrc) srcs.push_back({s, max(0, roundNo - 1)});

            for (auto& s : srcs) {
                vector<int> d = bfsFrom(s.first);
                for (int i = 0; i < R * C; ++i)
                    if (d[i] < INF) {
                        double v = (double)d[i] - (double)s.second;
                        if (v < 0) v = 0;
                        if (v < threat[i]) threat[i] = v;
                    }
            }
        }

        /* --------------------------- value table -------------------------- */
        int D = T - roundNo + 1;
        if (D < 1) D = 1;
        if (D > MAXD) D = MAXD;

        vector<vector<float>> V(D + 1, vector<float>(R * C, 0.f));
        vector<int> valued;
        for (int s = 1; s <= D; ++s) {
            int t = roundNo + s - 1;     // round in which we would arrive
            int rem = T - t;             // rounds left afterwards
            double disc = pow(GAMMA, (double)(s - 1));
            for (int cell = 0; cell < R * C; ++cell) {
                if (terr_[cell] == T_WALL) continue;
                int p = pnt_[cell];

                double ed = threat[cell] - (double)(t - roundNo);
                if (ed < 0) ed = 0;
                double pStay = 1.0;
                if (rem > 0 && ed <= (double)rem) pStay = P_STAY;

                double v;
                if (p == P_ENEMY) {
                    v = W_ENEMY * pStay;
                } else if (p == P_NONE || p == P_UNKNOWN) {
                    double contest = 1.0;
                    if (rem > 0) contest = exp(-ed / 2.0);
                    v = (W_NEUTRAL + DENIAL * contest) * pStay - NEUTRAL_LOSS * (1.0 - pStay);
                } else {
                    int age = roundNo - seenAt[cell];
                    if (age < STALE_AGE) continue;
                    double pFlip = W_STALE * min(1.0, (double)age / STALE_TAU);
                    v = 2.0 * pFlip * pStay;
                }
                if (terr_[cell] == T_UNKNOWN) v += W_FOG;
                if (enemyNow[cell]) v *= RISK_ENEMY_UNIT;
                if (v <= 0.001) continue;
                V[s][cell] = (float)(v * disc);
                if (s == 1) valued.push_back(cell);
            }
        }

        /* potential: pull units towards the nearest profitable cell */
        vector<float> pot(R * C, 0.f);
        {
            vector<int> dv = bfsMulti(valued);
            for (int i = 0; i < R * C; ++i) {
                int d = dv[i];
                if (d >= INF || d > 40) d = 40;
                pot[i] = (float)(-POT_W * (double)d);
            }
        }

        /* --------------------------- beam search -------------------------- */
        int perUnitCap = (U <= 2 ? 5 : (U == 3 ? 4 : 3));

        vector<Node> beam, nxt;
        beam.reserve(BEAM_W * 8);
        nxt.reserve(BEAM_W * 8);

        Node root;
        root.mask.fill(0);
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
            for (int i = 0; i < R * C; ++i) if (Vc[i] > 0.f) { anyValue = true; break; }
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
                        if (terr_[ni] == T_WALL) continue;
                        double v = (d == 4) ? 0.0 : Vc[ni];
                        if (ni == mine[u].blockCell) v *= BLOCK_PENALTY;
                        cand[nc2] = ni;
                        cval[nc2] = v;
                        nc2++;
                    }
                    if (nc2 == 0) { cand[nc2] = nd.pos[u]; cval[nc2] = 0.0; nc2++; }
                    /* keep the most promising moves only (matters when U is large) */
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
                            if (cur[a] == mine[a].blockCell) v *= BLOCK_PENALTY;
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
            if ((int)nxt.size() > BEAM_W) {
                nth_element(nxt.begin(), nxt.begin() + BEAM_W, nxt.end(),
                            [](const Node& a, const Node& b) { return keyOf(a) > keyOf(b); });
                nxt.resize(BEAM_W);
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

        /* hard safety: never order an impossible or duplicated move */
        for (int u = 0; u < U; ++u) {
            int nr = mine[u].r + DR[chosen[u]], nc = mine[u].c + DC[chosen[u]];
            if (!inB(nr, nc) || terr_[IDX(nr, nc)] == T_WALL) chosen[u] = 4;
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

        for (int u = 0; u < U; ++u) {
            mine[u].prev_r = mine[u].r;
            mine[u].prev_c = mine[u].c;
            mine[u].lastOrd = chosen[u];
        }
    }
    return 0;
}
