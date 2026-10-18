// Gym map traced from the official "Hallenplan" (coordinates = pixels of photos/elys_plan_salle.jpg, 1080 px wide).
// Edit it visually with app/map-editor.html, then replace this file with the exported one.
const GYM_MAP = {
  viewBox: [60, 515, 980, 1215],
  shapes: [
    { kind: 'outline', poly: [[82, 532], [322, 532], [322, 1455], [225, 1455], [225, 1585], [898, 1585], [898, 1542], [1022, 1542], [1022, 1715], [85, 1715]] },
    { kind: 'floor', area: 'main', poly: [[85, 535], [322, 535], [322, 1230], [250, 1225], [195, 1230], [140, 1270], [85, 1280]] },
    { kind: 'floor', area: 'labyrinth', poly: [[85, 1490], [225, 1490], [225, 1585], [565, 1585], [565, 1712], [85, 1712]] },
    { kind: 'floor', area: 'welle', poly: [[565, 1588], [1020, 1588], [1020, 1712], [565, 1712]] },
    { kind: 'room', area: 'board', name: 'map.fitness', poly: [[85, 1282], [140, 1282], [188, 1385], [188, 1490], [85, 1490]], label: [128, 1400, 0, 20] },
    { kind: 'room', area: 'none', name: 'map.entrance', poly: [[222, 1280], [322, 1280], [322, 1455], [222, 1455]], label: [272, 1370, -90, 20] },

    { kind: 'sector', id: 'highball', name: 'Highball', area: 'main', poly: [[86, 560], [118, 560], [118, 770], [86, 770]], label: [102, 665, -90] },
    { kind: 'sector', id: 'basilisk', name: 'Basilisk', area: 'main', poly: [[112, 618], [165, 618], [198, 700], [172, 742], [122, 700]], label: [155, 682, 62] },
    { kind: 'sector', id: 'couloir', name: 'Couloir', area: 'main', poly: [[96, 772], [158, 742], [172, 800], [150, 850], [98, 850]], label: [135, 800, 62] },
    { kind: 'sector', id: 'japanboard', name: 'Japan Board', area: 'board', poly: [[215, 558], [300, 558], [300, 640], [232, 700], [215, 640]], label: [262, 625, 90] },
    { kind: 'sector', id: 'suedwand', name: 'Südwand', area: 'main', poly: [[234, 702], [320, 642], [320, 900], [258, 882], [246, 780]], label: [282, 780, 90] },
    { kind: 'sector', id: 'nordwand', name: 'Nordwand', area: 'main', poly: [[205, 700], [242, 760], [216, 900], [182, 1000], [152, 982], [172, 880], [196, 782]], label: [186, 820, -72] },
    { kind: 'sector', id: 'wettkampfwand', name: 'Wettkampfwand', area: 'main', poly: [[86, 862], [128, 862], [116, 1050], [86, 1050]], label: [108, 955, -80] },
    { kind: 'sector', id: 'psychoblock', name: 'Psychoblock', area: 'main', poly: [[218, 920], [320, 902], [320, 1010], [292, 1010], [242, 992]], label: [268, 958, 0] },
    { kind: 'sector', id: 'dawnwall', name: 'Dawn Wall', area: 'main', poly: [[86, 1050], [120, 1050], [120, 1200], [86, 1200]], label: [104, 1125, -90] },
    { kind: 'sector', id: 'hafen', name: 'Hafen', area: 'main', poly: [[182, 992], [232, 1012], [246, 1210], [196, 1224], [176, 1100]], label: [212, 1120, 90] },
    { kind: 'sector', id: 'promenade', name: 'Promenade', area: 'main', poly: [[242, 1012], [320, 1012], [320, 1226], [266, 1230], [248, 1120]], label: [292, 1125, 90] },
    { kind: 'sector', id: 'vorgarten', name: 'Vorgarten', area: 'main', poly: [[86, 1200], [120, 1200], [120, 1278], [86, 1278]], label: [103, 1240, -90, 16] },

    { kind: 'sector', id: 'labyrinth', name: 'Labyrinth', area: 'labyrinth', poly: [[205, 1592], [545, 1588], [565, 1708], [435, 1710], [285, 1642], [205, 1700]], label: [382, 1616, 18] },
    { kind: 'sector', id: 'bucht', name: 'Bucht', area: 'welle', poly: [[553, 1610], [600, 1610], [600, 1706], [565, 1708]], label: [580, 1660, -90] },
    { kind: 'sector', id: 'traverse', name: 'Traverse', area: 'welle', poly: [[600, 1590], [898, 1588], [1015, 1606], [720, 1614], [600, 1608]], label: [784, 1601, 0] },
    { kind: 'sector', id: 'bug', name: 'Bug', area: 'welle', poly: [[640, 1692], [700, 1650], [762, 1640], [792, 1702], [640, 1710]], label: [712, 1682, -18] },
    { kind: 'sector', id: 'welle', name: 'Welle', area: 'welle', poly: [[792, 1682], [880, 1660], [922, 1688], [922, 1712], [800, 1712]], label: [846, 1696, 0] },
    { kind: 'sector', id: 'grotte', name: 'Grotte', area: 'welle', poly: [[898, 1545], [1020, 1545], [1020, 1644], [910, 1640], [898, 1590]], label: [962, 1578, 0] },
    { kind: 'sector', id: 'kilterboard', name: 'Kilterboard', area: 'board', poly: [[928, 1646], [1018, 1646], [1018, 1713], [928, 1713]], label: [973, 1680, 0, 14] },
  ],
};
