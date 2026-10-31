// Baseline: the original submission (kept for A/B testing against the new bot).
#include <iostream>
#include <vector>
#include <string>
#include <queue>
#include <tuple>
#include <cmath>
#include <algorithm>
#include <random>

using namespace std;

enum Terrain {
    TERR_UNKNOWN = 0,
    TERR_WALL = 1,
    TERR_OPEN = 2
};

enum Paint {
    PAINT_NONE = 0,
    PAINT_OURS = 1,
    PAINT_ENEMY = 2
};

struct Unit {
    int id;
    int r, c;
    int prev_r = -1, prev_c = -1;
    int last_order = 4; // 0:N, 1:E, 2:S, 3:W, 4:H
    int blocked_streak = 0;
};

// Directions: N, E, S, W, H
const int DR[5] = {-1, 0, 1, 0, 0};
const int DC[5] = {0, 1, 0, -1, 0};
const char DIR_CHAR[5] = {'N', 'E', 'S', 'W', 'H'};

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    string cmd;
    if (!(cin >> cmd) || cmd != "GAME") return 0;

    int R, C, U, V, T, known;
    cin >> R >> C >> U >> V >> T >> known;

    vector<vector<Terrain>> terrain(R, vector<Terrain>(C, TERR_UNKNOWN));
    vector<vector<Paint>> paint(R, vector<Paint>(C, PAINT_NONE));
    vector<vector<int>> last_seen(R, vector<int>(C, 0));
    vector<vector<int>> enemy_last_here(R, vector<int>(C, -1000));

    auto set_terrain = [&](int r, int c, Terrain t) {
        if (r < 0 || r >= R || c < 0 || c >= C) return;
        terrain[r][c] = t;
        // Exploit 180-degree rotational symmetry of the map
        int sr = R - 1 - r;
        int sc = C - 1 - c;
        terrain[sr][sc] = t;
    };

    if (known == 1) {
        string map_tag;
        cin >> map_tag; // "MAP"
        for (int r = 0; r < R; ++r) {
            string row_str;
            cin >> row_str;
            for (int c = 0; c < C; ++c) {
                if (row_str[c] == '#') {
                    terrain[r][c] = TERR_WALL;
                } else {
                    terrain[r][c] = TERR_OPEN;
                }
            }
        }
    }

    vector<Unit> units(U);
    mt19937 rng(1337);

    while (cin >> cmd) {
        if (cmd == "GAME_END") {
            double pts;
            cin >> pts;
            break;
        }
        if (cmd != "ROUND") break;

        int round_num, our_cells;
        cin >> round_num >> our_cells;

        vector<vector<bool>> currently_visible(R, vector<bool>(C, false));
        vector<vector<bool>> enemy_unit_now(R, vector<bool>(C, false));

        for (int i = 0; i < U; ++i) {
            string unit_tag;
            int id, r, c;
            cin >> unit_tag >> id >> r >> c;

            // Detect if our previous move was blocked
            if (round_num > 1 && units[id].last_order < 4) {
                int expected_r = units[id].prev_r + DR[units[id].last_order];
                int expected_c = units[id].prev_c + DC[units[id].last_order];
                if (r == units[id].prev_r && c == units[id].prev_c &&
                    expected_r >= 0 && expected_r < R && expected_c >= 0 && expected_c < C &&
                    terrain[expected_r][expected_c] != TERR_WALL) {
                    units[id].blocked_streak++;
                } else {
                    units[id].blocked_streak = 0;
                }
            } else {
                units[id].blocked_streak = 0;
            }

            units[id].id = id;
            units[id].r = r;
            units[id].c = c;

            // On Round 1, our starting positions mirror the opponent's starting positions
            if (round_num == 1) {
                int er = R - 1 - r;
                int ec = C - 1 - c;
                set_terrain(r, c, TERR_OPEN);
                paint[er][ec] = PAINT_ENEMY;
                enemy_last_here[er][ec] = 1;
            }

            for (int dr = -V; dr <= V; ++dr) {
                string view_row;
                cin >> view_row;
                int nr = r + dr;
                for (int dc = -V; dc <= V; ++dc) {
                    int nc = c + dc;
                    char ch = view_row[dc + V];
                    if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;

                    currently_visible[nr][nc] = true;
                    last_seen[nr][nc] = round_num;

                    if (ch == '#') {
                        set_terrain(nr, nc, TERR_WALL);
                    } else {
                        set_terrain(nr, nc, TERR_OPEN);
                        if (ch == '.') {
                            paint[nr][nc] = PAINT_NONE;
                        } else if (ch == '+' || ch == 'M') {
                            paint[nr][nc] = PAINT_OURS;
                        } else if (ch == '-' || ch == 'E') {
                            paint[nr][nc] = PAINT_ENEMY;
                            if (ch == 'E') {
                                enemy_unit_now[nr][nc] = true;
                                enemy_last_here[nr][nc] = round_num;
                            }
                        }
                    }
                }
            }
        }

        // Count how many adjacent unknown cells each cell has (frontier bonus)
        vector<vector<int>> unknown_neighbors(R, vector<int>(C, 0));
        for (int r = 0; r < R; ++r) {
            for (int c = 0; c < C; ++c) {
                if (terrain[r][c] == TERR_WALL) continue;
                for (int d = 0; d < 4; ++d) {
                    int nr = r + DR[d], nc = c + DC[d];
                    if (nr >= 0 && nr < R && nc >= 0 && nc < C && terrain[nr][nc] == TERR_UNKNOWN) {
                        unknown_neighbors[r][c]++;
                    }
                }
            }
        }

        // Base intrinsic value of visiting/painting each cell
        vector<vector<double>> cell_value(R, vector<double>(C, 0.0));
        for (int r = 0; r < R; ++r) {
            for (int c = 0; c < C; ++c) {
                if (terrain[r][c] == TERR_WALL) continue;

                if (terrain[r][c] == TERR_UNKNOWN) {
                    cell_value[r][c] = 11.0; // High priority to uncover fog
                } else {
                    if (paint[r][c] == PAINT_ENEMY) {
                        cell_value[r][c] = 16.0; // Swing of 2 cells (+1 us, -1 opponent)
                    } else if (paint[r][c] == PAINT_NONE) {
                        cell_value[r][c] = 10.0; // +1 cell for us
                    } else if (paint[r][c] == PAINT_OURS) {
                        int age = round_num - last_seen[r][c];
                        // Stale friendly cells might have been repainted by the opponent
                        if (!currently_visible[r][c] && age > 15) {
                            cell_value[r][c] = min(6.0, (age - 15) * 0.12);
                        } else {
                            cell_value[r][c] = 0.0;
                        }
                    }
                    // Bonus for stepping near unknown fog to reveal it with vision V
                    cell_value[r][c] += unknown_neighbors[r][c] * 2.5;
                }
            }
        }

        // Compute BFS distances from all units to all cells
        // Pass through TERR_OPEN and TERR_UNKNOWN (optimistic exploration)
        vector<vector<vector<int>>> dist(U, vector<vector<int>>(R, vector<int>(C, 1e9)));
        for (int u = 0; u < U; ++u) {
            queue<pair<int, int>> q;
            int sr = units[u].r, sc = units[u].c;
            dist[u][sr][sc] = 0;
            q.push({sr, sc});
            while (!q.empty()) {
                auto [cr, cc] = q.front();
                q.pop();
                int cd = dist[u][cr][cc];
                for (int d = 0; d < 4; ++d) {
                    int nr = cr + DR[d], nc = cc + DC[d];
                    if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
                    if (terrain[nr][nc] == TERR_WALL) continue;
                    if (dist[u][nr][nc] > cd + 1) {
                        dist[u][nr][nc] = cd + 1;
                        q.push({nr, nc});
                    }
                }
            }
        }

        // Assign distinct target goals to units and score each initial step (0..4)
        vector<int> chosen_dir(U, 4);
        vector<pair<int, int>> assigned_targets;

        // Order units so units with fewer good options or blocked streaks pick first
        vector<int> unit_order(U);
        for (int i = 0; i < U; ++i) unit_order[i] = i;

        vector<vector<bool>> occupied_next(R, vector<bool>(C, false));
        vector<pair<int, int>> next_pos(U, {-1, -1});

        for (int idx = 0; idx < U; ++idx) {
            int u = unit_order[idx];
            int ur = units[u].r, uc = units[u].c;

            // Find best target cell on the board for unit u, discounted by targets already claimed
            int best_tr = ur, best_tc = uc;
            double best_target_score = -1e9;

            for (int r = 0; r < R; ++r) {
                for (int c = 0; c < C; ++c) {
                    int d = dist[u][r][c];
                    if (d == 0 || d >= 1e8 || cell_value[r][c] <= 0.01) continue;

                    double val = cell_value[r][c];
                    // Penalize targets close to other friendly units' assigned targets
                    for (auto& [ar, ac] : assigned_targets) {
                        int md = abs(r - ar) + abs(c - ac);
                        if (md <= 2 * V + 2) {
                            val *= 0.25 + 0.75 * (double(md) / (2 * V + 3));
                        }
                    }

                    // Discount by travel distance
                    double score = val / pow(d + 1.5, 1.15);
                    if (score > best_target_score) {
                        best_target_score = score;
                        best_tr = r;
                        best_tc = c;
                    }
                }
            }
            assigned_targets.push_back({best_tr, best_tc});

            // Run reverse BFS from (best_tr, best_tc) to find which immediate neighbor moves closer
            vector<vector<int>> dist_to_target(R, vector<int>(C, 1e9));
            queue<pair<int, int>> q;
            dist_to_target[best_tr][best_tc] = 0;
            q.push({best_tr, best_tc});
            while (!q.empty()) {
                auto [cr, cc] = q.front();
                q.pop();
                int cd = dist_to_target[cr][cc];
                for (int d = 0; d < 4; ++d) {
                    int nr = cr + DR[d], nc = cc + DC[d];
                    if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
                    if (terrain[nr][nc] == TERR_WALL) continue;
                    if (dist_to_target[nr][nc] > cd + 1) {
                        dist_to_target[nr][nc] = cd + 1;
                        q.push({nr, nc});
                    }
                }
            }

            // Evaluate the 5 possible moves: N, E, S, W, H
            double best_move_score = -1e18;
            int best_d = 4;

            for (int d = 0; d < 5; ++d) {
                int nr = ur + DR[d];
                int nc = uc + DC[d];

                if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
                if (terrain[nr][nc] == TERR_WALL) continue;

                // Avoid colliding with an already scheduled friendly unit
                if (occupied_next[nr][nc]) continue;

                // Avoid swapping positions with an already scheduled friendly unit
                bool swap_conflict = false;
                for (int prev_i = 0; prev_i < idx; ++prev_i) {
                    int pu = unit_order[prev_i];
                    if (units[pu].r == nr && units[pu].c == nc &&
                        next_pos[pu].first == ur && next_pos[pu].second == uc) {
                        swap_conflict = true;
                        break;
                    }
                }
                if (swap_conflict) continue;

                double move_score = 0.0;

                // 1. Immediate paint value of stepping onto (nr, nc)
                if (d < 4) {
                    move_score += cell_value[nr][nc] * 2.0;
                }

                // 2. Progress toward chosen long-range target
                int step_dist = dist_to_target[nr][nc];
                if (step_dist < dist_to_target[ur][uc]) {
                    move_score += 25.0;
                } else if (step_dist == dist_to_target[ur][uc]) {
                    move_score += 5.0;
                }

                // 3. Avoid stepping onto a cell currently occupied by an enemy unit (likely holds)
                if (d < 4 && enemy_unit_now[nr][nc]) {
                    move_score -= 18.0;
                }

                // 4. Caution when an enemy unit is adjacent to (nr, nc) and might contest it
                if (d < 4) {
                    int adj_enemies = 0;
                    for (int ed = 0; ed < 4; ++ed) {
                        int er = nr + DR[ed], ec = nc + DC[ed];
                        if (er >= 0 && er < R && ec >= 0 && ec < C && enemy_unit_now[er][ec]) {
                            adj_enemies++;
                        }
                    }
                    if (adj_enemies > 0 && paint[nr][nc] == PAINT_OURS) {
                        // Don't waste a turn bumping into an enemy on a cell we already own
                        move_score -= 10.0 * adj_enemies;
                    }
                }

                // 5. Deadlock breaker: if we were blocked trying this exact direction last turn, penalize it
                if (units[u].blocked_streak > 0 && d == units[u].last_order) {
                    move_score -= 35.0 * units[u].blocked_streak;
                }

                // 6. Strongly discourage holding unless all moves are terrible
                if (d == 4) {
                    move_score -= 40.0;
                }

                // Small random tie-breaker to prevent deterministic loops
                move_score += uniform_real_distribution<double>(0.0, 0.3)(rng);

                if (move_score > best_move_score) {
                    best_move_score = move_score;
                    best_d = d;
                }
            }

            chosen_dir[u] = best_d;
            int final_r = ur + DR[best_d];
            int final_c = uc + DC[best_d];
            occupied_next[final_r][final_c] = true;
            next_pos[u] = {final_r, final_c};

            // Save state for next round's collision detector
            units[u].prev_r = ur;
            units[u].prev_c = uc;
            units[u].last_order = best_d;
        }

        // Output orders and flush immediately
        cout << "ORDERS";
        for (int i = 0; i < U; ++i) {
            cout << " " << DIR_CHAR[chosen_dir[i]];
        }
        cout << endl; // endl automatically flushes stdout
    }

    return 0;
}
