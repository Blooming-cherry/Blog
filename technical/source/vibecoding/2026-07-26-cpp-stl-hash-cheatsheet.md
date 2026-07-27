---
title: C++ STL 容器 & 哈希结构 知识速查
date: 2026-07-26
layout: page
comments: false
description: "从 C 手写哈希到 C++ STL 全家桶 —— vector / string / unordered_map / map / deque / priority_queue 全容器速查手册，附 6 种哈希构造 + 4 种冲突解决底层原理。"
---

> **实用优先**：高频容器在前，哈希底层原理在后。先能干活，再懂原理。

---

## 目录

1. [容器选型 30 秒决策](#1-容器选型-30-秒决策)
2. [std::vector — 你的默认容器](#2-stdvector--你的默认容器)
3. [std::string — 特殊的 vector\<char\>](#3-stdstring--特殊的-vectorchar)
4. [std::unordered_map — O(1) 哈希表](#4-stdunordered_map--o1-哈希表)
5. [std::unordered_set — 去重 + 快速判断](#5-stdunordered_set--去重--快速判断)
6. [std::map / std::set — 有序的红黑树](#6-stdmap--stdset--有序的红黑树)
7. [第二梯队容器：deque / array / list](#7-第二梯队容器deque--array--list)
8. [容器适配器：stack / queue / priority_queue](#8-容器适配器stack--queue--priority_queue)
9. [全容器复杂度速查](#9-全容器复杂度速查)
10. [哈希底层原理：6 种构造 + 4 种冲突解决](#10-哈希底层原理6-种构造--4-种冲突解决)
11. [自实现哈希表](#11-自实现哈希表)
12. [面试高频考点](#12-面试高频考点)

---

## 1. 容器选型 30 秒决策

```
顺序存储一堆东西？
├── 需要随机访问 [i]？
│   ├── 大小编译期已知 → std::array
│   ├── 只在尾部增删     → std::vector  ← 90% 的情况
│   └── 需要在头部增删   → std::deque
└── 频繁在中间插入/删除  → std::list（一般别用，见 §7）

键值查找？
├── 需要按 key 排序遍历 → std::map
├── 只需要 O(1) 查找    → std::unordered_map
├── 允许重复 key        → std::multimap / unordered_multimap
└── 只存 key 无 value   → std::set / unordered_set

特殊行为？
├── 始终取最大/最小      → std::priority_queue  （Top-K、Dijkstra）
├── 先进先出            → std::queue            （BFS、消息队列）
├── 后进先出            → std::stack            （DFS、括号匹配）
└── 连续内存 + 字符串语义 → std::string
```

### 一句话速记

| 容器 | 一句话 | 内部结构 |
|------|--------|----------|
| `vector` | 默认容器，连续内存 | 动态数组 |
| `string` | `vector<char>` + 字符串操作 | 动态数组 + SSO |
| `unordered_map` | O(1) 键值查找 | 哈希表（链地址法） |
| `unordered_set` | O(1) 去重/判存在 | 哈希表 |
| `map` | 按键排序的键值对 | 红黑树 |
| `set` | 有序去重集合 | 红黑树 |
| `deque` | 头尾都能快速增删 | 分块数组 |
| `array` | 安全版 C 数组 | 栈上定长数组 |
| `priority_queue` | 始终取最值 | 堆（默认大顶堆） |
| `list` | 双向链表（别用） | 双向链表 |

---

## 2. std::vector — 你的默认容器

> **内部结构：** 三指针 —— `begin` / `end` / `capacity_end`
> ```
> [1][2][3][?][?][?][?][?]
>  |<--size-->|
>  |<------capacity------>|
> ```

### 2.1 声明

```cpp
#include <vector>

vector<int> v1;                        // 空
vector<int> v2(10);                    // 10 个 0
vector<int> v3(10, -1);                // 10 个 -1
vector<int> v4 = {1, 2, 3, 4, 5};      // 初始化列表
vector<vector<int>> mat(3, vector<int>(4, 0));  // 3×4 二维
```

### 2.2 核心操作

```cpp
vector<int> v = {1, 2, 3};

// ── 增 ──
v.push_back(4);           // 拷贝/移动，均摊 O(1)
v.emplace_back(5);        // 原地构造，优于 push_back

// ── 删 ──
v.pop_back();             // 删尾部，O(1)
v.erase(v.begin() + 1);   // 删中间，O(n)  ← 注意！
v.clear();                // size = 0，capacity 不变

// ── 查 ──
int a = v[2];             // 不检查越界
int b = v.at(2);          // 越界抛 std::out_of_range
int c = v.front();        // 第一个
int d = v.back();         // 最后一个

// ── 大小 ──
v.size();                 // 当前元素数
v.capacity();             // 已分配容量
v.empty();                // 是否为空
```

### 2.3 size vs capacity（必考）

```cpp
vector<int> v;
v.reserve(100);           // capacity ≥ 100，size 仍为 0
v[0] = 42;                // ❌ size=0，UB！
v.push_back(42);          // ✅ 正确

v.resize(5);              // size = 5，新元素默认值 0
v.resize(10, -1);         // size = 10，新元素 = -1
v.resize(3);              // size = 3，尾部元素被销毁
```

### 2.4 遍历删元素（经典坑）

```cpp
vector<int> v = {10, 20, 30, 40, 50};

// ✅ 正确写法：利用 erase 返回下一个有效迭代器
for (auto it = v.begin(); it != v.end(); /* 不递增 */) {
    if (*it % 20 == 0)
        it = v.erase(it);    // 返回下一个
    else
        ++it;
}

// ✅ erase-remove 惯用法（删所有等于 30 的元素）
v.erase(remove(v.begin(), v.end(), 30), v.end());
```

### 2.5 扩容机制

```
GCC/libstdc++: 1 → 2 → 4 → 8 → 16 ...    (×2)
MSVC:          1 → 2 → 3 → 4 → 6 → 9 ...  (×1.5)

均摊分析：插入 n 个元素，总拷贝 < 2n → 每次 push_back 均摊 O(1)
```

| 操作 | 复杂度 |
|------|--------|
| `push_back` / `emplace_back` | O(1) 均摊 |
| `pop_back` | O(1) |
| `operator[]` / `at()` / `front` / `back` | O(1) |
| `insert(pos)` / `erase(pos)` | **O(n)** ⚠️ |
| `find()` | O(n) |
| `sort()` | O(n log n) |
| `reserve()` / `resize()` | O(n) |

---

## 3. std::string — 特殊的 `vector<char>`

> **内部：** 和 vector 一样连续存储 + **SSO（短字符串优化）**——短字符串不分配堆内存。

### 3.1 常用操作

```cpp
#include <string>

string s = "hello";
string s2("world");
string s3(10, 'x');              // "xxxxxxxxxx"

// ── 拼接 ──
string t = s + " " + s2;         // "hello world"
s += "!";                        // 追加
s.append(" world");              // 同上

// ── 子串 ──
string sub = s.substr(0, 3);     // "hel"
string_view sv = s;              // C++17，不拷贝

// ── 查找 ──
size_t pos = s.find("lo");       // 返回索引，找不到返回 npos
if (s.find("xx") == string::npos) { /* 没找到 */ }
bool start = s.starts_with("he");  // C++20
bool end   = s.ends_with("lo");    // C++20

// ── 数值转换 ──
int    n = stoi("42");
double d = stod("3.14");
string s = to_string(123);       // "123"

// ── C API 交互 ──
const char* cstr = s.c_str();    // 返回 null-terminated 字符串
// ⚠️ s 被修改后，cstr 可能失效
```

### 3.2 string_view（C++17）— 零拷贝参数

```cpp
void process(string_view sv) {    // 接受 string / const char* / 子串
    cout << sv.substr(0, 3);      // substr 也是 O(1)，不拷贝
}

process("literal");        // ✅
process(string("hello"));  // ✅
process(s);                // ✅
```

> **原则：** 函数参数用 `string_view`，返回值用 `string`（别返回 string_view 指向临时对象）。

---

## 4. std::unordered_map — O(1) 哈希表

> **内部结构：** `vector<list<pair<K,V>>>` — 桶数组 + 链表（链地址法）
> 负载因子默认 1.0，超过后自动 rehash（扩容 + 重新分配所有元素）

### 4.1 增删查

```cpp
#include <unordered_map>
unordered_map<string, int> m;

// ── 插入 ──
m["alice"] = 25;                     // 不存在→插入，存在→覆盖
m.insert({"bob", 30});               // 返回 pair<iter, bool>
m.emplace("charlie", 22);            // 原地构造
m.insert_or_assign("alice", 27);     // C++17，存在则覆盖
m.try_emplace("diana", 28);          // C++17，不存在才构造

// ── 查找 ──
auto it = m.find("alice");           // 返回迭代器或 end()
if (m.contains("alice")) { ... }     // C++20，最清晰
if (m.count("alice"))    { ... }     // 返回 0 或 1

// ⚠️ operator[] 的坑
int x = m["nonexistent"];            // 会插入 {"nonexistent", 0}！
int y = m.at("nonexistent");         // 抛 std::out_of_range ✅安全

// ── 删除 ──
m.erase("alice");                    // 按 key 删，返回 0 或 1
m.erase(it);                         // 按迭代器删
m.clear();                           // 清空
```

### 4.2 遍历

```cpp
// C++17 结构化绑定（推荐）
for (const auto& [key, value] : m) {
    cout << key << " → " << value << '\n';
}

// 遍历中删除（安全写法）
for (auto it = m.begin(); it != m.end(); ) {
    if (it->second < 20)
        it = m.erase(it);            // ✅ 用返回值
    else
        ++it;
}
// ❌ for (auto& kv : m) { m.erase(kv.first); }  — 迭代器失效
```

### 4.3 自定义键的哈希

```cpp
struct Person { string name; int age; };

struct PersonHash {
    size_t operator()(const Person& p) const {
        return hash<string>{}(p.name) ^ (hash<int>{}(p.age) << 1);
    }
};

// 别忘了 operator==
struct PersonEq {
    bool operator()(const Person& a, const Person& b) const {
        return a.name == b.name && a.age == b.age;
    }
};

unordered_map<Person, string, PersonHash, PersonEq> m;
```

| 操作 | 平均 | 最坏 |
|------|------|------|
| insert / find / erase(k) | O(1) | O(n) |
| operator[] / at() | O(1) | O(n) |
| 遍历全部 | O(n) | O(n) |
| rehash / reserve | O(n) | O(n) |

> 最坏 O(n)：所有 key 哈希到同一个桶（恶意构造 / 极差哈希函数）

---

## 5. std::unordered_set — 去重 + 快速判断

```cpp
#include <unordered_set>
unordered_set<int> s = {1, 5, 6, 7, 8};

// 插入
s.insert(9);                          // 返回 pair<iter, bool>
s.emplace(10);                        // 原地构造

// 查找
if (s.contains(6)) { ... }            // C++20
if (s.find(6) != s.end()) { ... }     // C++11+
if (s.count(6)) { ... }               // 0 或 1

// 删除
s.erase(5);                           // 按值删

// 集合运算（手写）
unordered_set<int> a = {1,2,3}, b = {3,4,5}, r;

// 交集：遍历小的那份
for (int x : a) if (b.count(x)) r.insert(x);   // → {3}

// 并集
for (int x : a) r.insert(x);
for (int x : b) r.insert(x);                   // → {1,2,3,4,5}

// 差集 a \ b
for (int x : a) if (!b.count(x)) r.insert(x);  // → {1,2}
```

---

## 6. std::map / std::set — 有序的红黑树

> **一句话选型：** 需要按 key 排序遍历 → map/set；只需 O(1) 查找 → unordered 版本。

```
内存中的红黑树：
               [4]
              /   \
           [2]     [6]
          /  \    /  \
        [1] [3] [5] [7]

中序遍历 = 1, 2, 3, 4, 5, 6, 7  ← 自动有序
```

### 6.1 基本操作

```cpp
#include <map>
#include <set>

map<string, int> m = {{"c",3}, {"a",1}, {"b",2}};
// 内部：{"a",1}, {"b",2}, {"c",3}   ← 自动按 key 排序

set<int> s = {3, 1, 2};
// 内部：1, 2, 3                     ← 自动排序

// 增删查语法同 unordered_map/set，区别在复杂度：O(log n)
```

### 6.2 map 独有的有序操作

```cpp
map<int, string> m = {{1,"a"}, {3,"c"}, {5,"e"}};

auto lb = m.lower_bound(3);   // 第一个 ≥ 3 → {3,"c"}
auto ub = m.upper_bound(3);   // 第一个 > 3 → {5,"e"}
auto [lo, hi] = m.equal_range(3);

// 反向遍历
for (auto rit = m.rbegin(); rit != m.rend(); ++rit) { /* 5,3,1 */ }

// 按自定义排序（注意语法）
map<int, string, greater<int>> desc;  // 降序
```

### 6.3 哈希 vs 红黑树 对比

```
                     unordered_map          map
───────────────────────────────────────────────────
底层                   哈希表                 红黑树
查找/插入/删除          O(1) 平均              O(log n) 稳定
遍历顺序                随机                   按键排序
内存                   较大（桶+链表）         较小
迭代器稳定性            rehash 时全失效        只有被删元素失效
自定义比较器            hash + ==             只需 <
适用                   "查得快"               "要有序"
```

---

## 7. 第二梯队容器：deque / array / list

### 7.1 std::deque — 双端队列

> **内部：** 分块数组。头尾增删 O(1)，中间 O(n)。内存不如 vector 紧凑，但比 list 快。

```cpp
#include <deque>
deque<int> dq = {2, 3, 4};

dq.push_front(1);          // 头部插入，O(1)  ← vector 没有
dq.push_back(5);           // 尾部插入，O(1)
dq.pop_front();            // 头部删除，O(1)
dq.pop_back();             // 尾部删除，O(1)

int a = dq[2];             // 随机访问 O(1)，但稍慢于 vector（两次指针跳转）
```

```
使用场景：
✅ 需要头尾都增删 + 偶尔随机访问 → deque
✅ 实现 BFS 的队列底层（queue 默认用 deque）
❌ 大部分情况用 vector 就够了
```

### 7.2 std::array — 安全版 C 数组

> **编译期定长，零开销，不退化指针，有 size()**

```cpp
#include <array>
array<int, 5> arr = {1, 2, 3, 4, 5};

int x = arr[2];            // 不检查越界
int y = arr.at(2);         // 越界抛异常
size_t n = arr.size();     // 5，编译期常量
int* raw = arr.data();     // 需要 C API 时取裸指针

// ❌ arr.push_back(6);    // 没有这个！大小是编译期固定的
```

```
array vs C 数组
✅ 有 size()，不退化指针
✅ 可以按值传入/返回函数（C 数组不行）
✅ .at() 有边界检查
❌ 大小必须编译期确定
```

### 7.3 std::list — 双向链表

> **大部分时候不该用的容器。**

```cpp
#include <list>
list<int> l = {2, 3, 4};

l.push_front(1);           // O(1)
l.push_back(5);            // O(1)

auto it = next(l.begin());
l.insert(it, 99);          // O(1) — list 的 killer feature
l.erase(it);               // O(1)，且不会让其他迭代器失效

// 自带的 O(n) 成员函数（比 <algorithm> 的通用版快）
l.sort();
l.unique();
```

```
什么时候用 list？
✅ 元素很大（如 string of 1KB），且频繁在中间插入删除
✅ 需要插入时其他迭代器绝对不失效

什么时候不用？
❌ 遍历比 vector 慢 10-50×（cache miss）
❌ 每个元素有 2 个指针开销（16 字节在 64 位系统）
❌ 不能随机访问
```

---

## 8. 容器适配器：stack / queue / priority_queue

> 它们不是独立的数据结构，而是给底层容器套了一层接口限制。

```
stack   → 封掉头端，只留尾部 push/pop → LIFO
queue   → 封掉头端 push + 尾端 pop  → FIFO
priority_queue → 每次 pop 取最大值   → 堆
```

### 8.1 std::stack — 后进先出

```cpp
#include <stack>
stack<int> st;                   // 默认底层 deque<int>

st.push(1);
st.push(2);
st.push(3);
int top = st.top();              // 3（只看不删）
st.pop();                        // 删 3
// st.pop() 不返回值！先 top() 再 pop()

while (!st.empty()) {
    cout << st.top() << ' ';     // 2 1
    st.pop();
}
```

### 8.2 std::queue — 先进先出

```cpp
#include <queue>
queue<int> q;                    // 默认底层 deque<int>

q.push(1);  q.push(2);  q.push(3);
int front = q.front();           // 1（队首）
int back  = q.back();            // 3（队尾）
q.pop();                         // 删 1

while (!q.empty()) {
    cout << q.front() << ' ';    // 2 3
    q.pop();
}
```

### 8.3 std::priority_queue — 始终取最值

> **默认大顶堆（最大的在顶上）**。你的 Game AI 里 A* 的 open set 就用它。

```cpp
#include <queue>  // priority_queue 在这里
priority_queue<int> pq;

pq.push(3); pq.push(1); pq.push(5); pq.push(2);

while (!pq.empty()) {
    cout << pq.top() << ' ';     // 5 3 2 1   ← 总是最大的先出
    pq.pop();
}

// 小顶堆（最小的在上）
priority_queue<int, vector<int>, greater<int>> min_pq;
// 第二个参数是底层容器，第三个是比较器

// 自定义比较
auto cmp = [](int a, int b) { return a > b; };
priority_queue<int, vector<int>, decltype(cmp)> pq_custom(cmp);

// 自定义类型
struct Node { int id, cost; };
priority_queue<pair<int, int>, vector<pair<int,int>>, greater<>> dijkstra_pq;
//                           cost, node                    ↑ C++14 CTAD
```

---

## 9. 全容器复杂度速查

### 9.1 容器操作

```
操作              vector    string    deque    list    array
────────────────────────────────────────────────────────────
[i]               O(1)      O(1)      O(1)     -       O(1)
at(i)             O(1)      O(1)      O(1)     -       O(1)
push_back         O(1)†     O(1)†     O(1)     O(1)    -
push_front        -         -         O(1)     O(1)    -
pop_back          O(1)      O(1)      O(1)     O(1)    -
pop_front         -         -         O(1)     O(1)    -
insert(mid)       O(n)      O(n)      O(n)     O(1)    -
erase(mid)        O(n)      O(n)      O(n)     O(1)    -
find              O(n)      O(n)      O(n)     O(n)    O(n)
front/back        O(1)      O(1)      O(1)     O(1)    O(1)
size/empty        O(1)      O(1)      O(1)     O(1)    O(1)
遍历              O(n)      O(n)      O(n)     O(n)    O(n)

† 均摊 O(1)
```

```
操作             u_map     u_set     map       set
───────────────────────────────────────────────────
[ ] / at()       O(1)*     -         O(log n)  -
find / count     O(1)*     O(1)*     O(log n)  O(log n)
contains(C++20)  O(1)*     O(1)*     O(log n)  O(log n)
insert           O(1)*     O(1)*     O(log n)  O(log n)
erase(key)       O(1)*     O(1)*     O(log n)  O(log n)
erase(it)        O(1)      O(1)      O(1)††    O(1)††
lower_bound      -         -         O(log n)  O(log n)
遍历             O(n)      O(n)      O(n)      O(n)

* 平均，最坏 O(n)
†† 均摊
```

### 9.2 适配器

```
操作              stack     queue     priority_queue
────────────────────────────────────────────────────
push              O(1)      O(1)      O(log n)
pop               O(1)      O(1)      O(log n)
top/front         O(1)      O(1)      O(1)
```

### 9.3 空间开销

```
结构               每个元素额外开销
────────────────────────────────────
vector / string   0（连续紧凑）
array             0（栈上）
deque             极少（分块控制块）
list              2 个指针 (16B)
forward_list      1 个指针 (8B)
set / map         3 个指针 + 颜色 (≈24B per node)
u_set / u_map     1 个指针 + 桶数组开销
```

---

## 10. 哈希底层原理：6 种构造 + 4 种冲突解决

> 这部分是理论深度。面试可能问，实际工程中 `std::unordered_map` 已经帮你做好了。
> 只在需要**自实现**或**极端优化**时才需要深入。

### 10.1 哈希函数的 6 种构造方法

#### ① 直接定址法
```
H(key) = key        或       H(key) = a×key + b
```
key 即地址，零冲突。仅当 key 范围小且连续时可行。
```cpp
int freq[26] = {0};
freq[c - 'a']++;   // 'a'→0, 'b'→1, ...
```

#### ② 除留余数法（最常用）
```
H(key) = key % p        p 取 ≤ 表长的最大素数
```
**`std::unordered_map` 实际使用的就是这个（组合哈希后取模）。**
```cpp
// 经典素数备选
53, 97, 193, 389, 769, 1543, 3079, 6151, 12289, 24593, 49157, 98317, ...
// 每次 ×2 左右，取刚好大于预期 key 数量的那个
```

#### ③ 数字分析法
取 key 分布最均匀的若干位作为哈希地址。
```
学号 20240101 → 前 4 位相同 → 丢弃，取后 4 位
```
适用：已知全部 key 的静态表（编译器的关键字表）。

#### ④ 平方取中法
```
key=1234 → key²=1522756 → 取中间 3 位 → 227
```
平方使原 key 每一位都对中间位产生混合。

#### ⑤ 折叠法
```
key=9876543210 分割为 987|654|321|0 → 移位折叠求和 → 1962
```
适用：超长 key（身份证号、ISBN）。

#### ⑥ 随机数法
```
H(key) = random(key)    // 确定性伪随机函数
```
几乎不用，被生产级哈希（SipHash / xxHash）取代。

```
方法              核心思路            冲突      适用场景
─────────────────────────────────────────────────────────
直接定址法         key 即地址          零         key 范围小且连续
除留余数法 ⭐       key % 素数          靠素数     通用，最常用
数字分析法         取均匀位            少         静态 key 集合
平方取中法         平方后取中间位      较少        key 位数不多
折叠法             分组求和            中等       key 超长
随机数法           伪随机函数          靠质量     几乎不用
```

---

### 10.2 哈希冲突的 4 种解决方法

#### ① 链地址法（Separate Chaining）⭐ C++ STL 标准做法

```
桶 0: [26] → [39] → [13] → nullptr
桶 1: [15] → nullptr
桶 2: nullptr
桶 3: [37] → nullptr

本质：vector<list<pair<K,V>>>
```

| 优点 | 缺点 |
|------|------|
| 实现简单 | 每个节点有指针开销 |
| 负载因子可 >1 | 缓存不友好（指针跳转） |
| 删除简单 | 极端情况退化到 O(n) |

#### ② 开放定址法 — 三种探测策略

| 探测 | 公式 | 问题 |
|------|------|------|
| 线性探测 | `h + i` | 一次聚集（连续占用块越积越长） |
| 平方探测 | `h + i²` | 二次聚集，需素数表长 + load<0.5 |
| **双哈希** ⭐ | `h₁ + i×h₂` | 理论最优，彻底消除聚集 |

```cpp
// 双哈希示例
size_t h1 = hash<K>{}(key);
size_t h2 = 1 + (hash<K>{}(key) % (tableSize - 1));
size_t idx = (h1 + i * h2) % tableSize;
```

#### ③ 再哈希法
准备多个哈希函数，冲突时换一个重算。不单独使用，出现在 rehash 阶段（扩容后重新分配所有 key）。

#### ④ 公共溢出区
基本表和溢出表分离。冲突全进溢出区（退化为顺序搜索）。仅适合冲突极少的场景。

```
方法                   C++ STL 采用？   实际地位
────────────────────────────────────────────────
链地址法               ✅ 唯一标准做法    主流
开放定址·线性探测      ❌                 少用
开放定址·平方探测      ❌                 少用
开放定址·双哈希        ❌                 Robin Hood / SwissTable 变体
再哈希法               ❌                 扩容时必用
公共溢出区             ❌                 几乎不用
```

---

## 11. 自实现哈希表

> 理解底层的最佳方式。面试手写首选**链地址法**。

### 11.1 链地址法（80 行）

```cpp
template<typename K, typename V>
class SimpleHashMap {
    vector<list<pair<K, V>>> buckets;
    size_t num_elements = 0;
    float max_load = 0.75f;

    size_t idx(const K& k) const { return hash<K>{}(k) % buckets.size(); }

    void rehash() {
        auto old = move(buckets);
        buckets.resize(old.size() * 2);
        num_elements = 0;
        for (auto& b : old)
            for (auto& [k, v] : b)
                buckets[idx(k)].emplace_back(k, move(v)), ++num_elements;
    }

public:
    SimpleHashMap(size_t cap = 16) : buckets(cap) {}

    void put(const K& k, const V& v) {
        for (auto& [key, val] : buckets[idx(k)])
            if (key == k) { val = v; return; }
        buckets[idx(k)].emplace_back(k, v);
        if (++num_elements > buckets.size() * max_load) rehash();
    }

    V* get(const K& k) {
        for (auto& [key, val] : buckets[idx(k)])
            if (key == k) return &val;
        return nullptr;
    }

    bool erase(const K& k) {
        auto& b = buckets[idx(k)];
        for (auto it = b.begin(); it != b.end(); ++it)
            if (it->first == k) { b.erase(it); --num_elements; return true; }
        return false;
    }

    size_t size() const { return num_elements; }
};
```

### 11.2 开放定址法（核心差异）

```cpp
template<typename K, typename V>
class OpenAddrHashMap {
    enum State { EMPTY, OCCUPIED, DELETED };
    struct Slot { State state = EMPTY; pair<K, V> kv; };
    vector<Slot> table;
    size_t n = 0;

    size_t probe(const K& k) const {
        size_t h = hash<K>{}(k) % table.size();
        while (table[h].state == OCCUPIED && table[h].kv.first != k)
            h = (h + 1) % table.size();   // 线性探测
        return h;
    }

    void rehash() {
        auto old = move(table);
        table.resize(old.size() * 2); n = 0;
        for (auto& s : old)
            if (s.state == OCCUPIED) put(s.kv.first, s.kv.second);
    }

public:
    OpenAddrHashMap(size_t cap = 16) : table(cap) {}

    void put(const K& k, const V& v) {
        if (n * 1.0 / table.size() >= 0.7) rehash();
        size_t h = probe(k);
        if (table[h].state != OCCUPIED) ++n;
        table[h] = {OCCUPIED, {k, v}};
    }

    V* get(const K& k) {
        size_t h = hash<K>{}(k) % table.size(), start = h;
        do {
            if (table[h].state == EMPTY) return nullptr;
            if (table[h].state == OCCUPIED && table[h].kv.first == k)
                return &table[h].kv.second;
            h = (h + 1) % table.size();
        } while (h != start);
        return nullptr;
    }

    bool erase(const K& k) {
        size_t h = hash<K>{}(k) % table.size(), start = h;
        do {
            if (table[h].state == EMPTY) return false;
            if (table[h].state == OCCUPIED && table[h].kv.first == k) {
                table[h].state = DELETED; --n; return true;
            }
            h = (h + 1) % table.size();
        } while (h != start);
        return false;
    }
};
```

---

## 12. 面试高频考点

### 12.1 Two Sum（必考）

```cpp
vector<int> twoSum(vector<int>& nums, int target) {
    unordered_map<int, int> seen;  // value → index
    for (int i = 0; i < nums.size(); ++i) {
        int need = target - nums[i];
        if (seen.contains(need)) return {seen[need], i};
        seen[nums[i]] = i;
    }
    return {};
}
// 暴力 O(n²) → 哈希 O(n)
```

### 12.2 哈希 vs 数组：选哪个

```cpp
// key 范围小且连续 → 用数组（零哈希开销，无冲突）
int freq[26] = {0};
for (char c : s) freq[c - 'a']++;

// key 范围不确定/稀疏/非整数 → 用哈希
unordered_map<string, int> word_count;
for (auto& w : words) word_count[w]++;
```

### 12.3 易错点速记

```cpp
// ① operator[] 会意外插入
if (m["key"] == 0) { }        // ❌ "key" 已被插入！
if (m.find("key") == m.end()) // ✅ 不修改容器

// ② 遍历中删除
for (auto it = m.begin(); it != m.end(); ) {
    if (bad(it)) it = m.erase(it);   // ✅
    else ++it;
}
// for (auto& kv : m) { m.erase(kv.first); }  // ❌ 迭代器失效

// ③ reserve 不改变 size
v.reserve(100);
v[0] = 42;                    // ❌ size 还是 0！

// ④ vector<bool> 是特例
vector<bool> vb = {true};
// auto& b = vb[0];           // ❌ 返回 proxy，不是引用
auto b = vb[0];               // ✅ 按值接收

// ⑤ 多线程：STL 容器读写均非线程安全，需加锁
```

---

> **总结：** 
> - 90% 的情况：`vector` + `unordered_map` + `string` 
> - 需要排序：`map` / `set`
> - 双端操作：`deque`
> - 最值：`priority_queue`
> - 哈希底层原理（§10-11）是理解 `unordered_map` 为什么 O(1) 的基础，但日常编码不需要自己实现。
> - 选容器的第一原则：**先确定访问模式，再选数据结构**。没有万能容器，只有最匹配的容器。
