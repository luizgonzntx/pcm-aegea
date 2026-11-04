(function (root) {
  'use strict';
  // Transcrição do levantamento preliminar fornecido por imagem.
  // Potência pertence à seção; não é repetida nem somada por equipamento.
  // Ausências e a notação de projeto são preservadas, sem inferir totais.
  const section = (name, powerCv, rows) => ({ name, powerCv, equipment: rows.map(([name, project, installed, operating, hotReserve, maintenance]) => ({ name, project, installed, operating, hotReserve, maintenance })) });
  const units = [
    { id: 'eta-sul', name: 'ETA Sul', sections: [
      section('Captação', 1750, [['Cj Motobomba','3+2',5,4,1,0],['Inversor','5',5,4,1,0],['Transformador','2',2,2,0,0]]),
      section('ETA 1', 3000, [['Cj Motobomba','2+1',3,2,1,0],['Soft','2',2,1,1,0],['Partida direta','1',1,1,0,0],['Trafo','3',1,1,0,0]]),
      section('ETA 3', 1200, [['Cj Motobomba','2+1',3,3,0,0],['Inversor','3',3,3,0,0],['Trafo','1',1,1,0,0]]),
      section('ETA 4', 4000, [['Cj Motobomba','1+1',2,1,1,0],['Partida direta','2',2,1,1,0],['Trafo','2',2,2,0,0]])
    ] },
    { id: 'r10-promora', name: 'R10 - Promora', sections: [section('Unidade', 100, [['Cj Motobomba','2+1',2,2,0,0],['Inversor','1',1,1,0,0],['Soft','1',1,1,0,0],['Trafo','1',1,1,0,0]])] },
    { id: 'rn1-a', name: 'RN1-A', sections: [section('Unidade', 650, [['Cj Motobomba','2+1',3,3,0,0],['Inversor','3',3,3,0,0],['Trafo','2',2,2,0,0]])] },
    { id: 'booster-eduardo-costa', name: 'Booster Eduardo Costa', sections: [section('Unidade', 60, [['Cj Motobomba','2+1',2,2,0,0],['Soft','1',1,1,0,0],['Partida direta','1',1,1,0,0],['Trafo','1',1,1,0,0]])] },
    { id: 'booster-dirceu', name: 'Booster Dirceu', sections: [section('Unidade', 650, [['Cj Motobomba','1+1',2,1,1,0],['Inversor','2',2,1,1,0],['Trafo','1',1,1,0,0]])] },
    { id: 'elevatoria-dirceu', name: 'Elevatória Dirceu', aliases: ['Elevat. Dirceu'], sections: [
      section('Elevado', 480, [['Cj Motobomba','2+1',3,2,1,0],['Soft','3',2,2,0,0],['Trafo','1',1,1,0,0]]),
      section('Alto da Ressurreição', 480, [['Cj Motobomba','2+0',2,2,0,0],['Soft','2',2,2,0,0],['Trafo','1',1,1,0,0]])
    ] },
    { id: 'booster-petronio-portela', name: 'Booster Petronio Portela', sections: [section('Unidade', 2800, [['Cj Motobomba','4+2',6,4,2,2],['Inversor','4',4,4,2,0],['Trafo','3',3,1,2,0]])] },
    { id: 'risoleta-neves', name: 'Risoleta Neves', sections: [section('Unidade', 40, [['Cj Motobomba','1+1',2,2,0,0],['Inversor','2',2,2,0,0],['Trafo','1',1,1,0,0]])] },
    { id: 'sist-r7', name: 'Sist. R7', aliases: ['Sistema R7'], sections: [
      section('CJ p/ unidade', null, [['Trafo','1',1,1,0,0]]),
      section('Elevado', 300, [['Cj Motobomba','1+1',1,1,0,0],['Inversor',null,1,1,0,0]]),
      section('Planalto Uruguai', 600, [['Cj Motobomba','2+1',3,2,0,1],['Inversor','1',1,1,0,0],['Soft','1',1,1,0,0]]),
      section('Satélite', 80, [['Cj Motobomba','2+0',2,2,0,0],['Direta','1',1,1,0,0],['Soft','1',1,1,0,0]])
    ] },
    { id: 'planalto-uruguai', name: 'Planalto Uruguai', aliases: ['Planato Uruguai'], sections: [
      section('Sistema 01 - EAT 14', 150, [['Cj Motobomba','1+1',2,1,1,0],['Soft','2',1,1,0,0],['Trafo','1',1,1,0,0]]),
      section('Sistema 02 - EAT 15', 250, [['Cj Motobomba','1+1',2,1,1,0],['Soft','1',1,1,0,0],['Trafo','1',1,1,0,0]])
    ] },
    { id: 'eta-norte', name: 'ETA Norte', sections: [
      section('Captação', 450, [['Cj Motobomba','2+2',4,2,0,2],['Inversor','2',1,1,0,0],['Soft','2',2,2,1,0],['Trafo','2',2,2,0,0]]),
      section('Recalque', 1050, [['Cj Motobomba','1+2',3,1,1,1],['Inversor','2',2,2,1,0],['Soft','1',1,1,1,0],['Trafo','1',1,1,0,0]])
    ] }
  ];
  const key = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  function find(name) {
    const normalized = key(name);
    if (!normalized) return null;
    const matches = units.filter(unit => [unit.name, ...(unit.aliases || [])].some(alias => key(alias) === normalized));
    return matches.length === 1 ? matches[0] : null;
  }
  const api = { units, find };
  if (typeof module !== 'undefined') module.exports = api;
  root.PCM_INVENTORY = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
