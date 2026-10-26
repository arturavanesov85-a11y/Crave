// Справочник марок и моделей для подсказок в CRM. Дополняется значениями, уже введёнными в базу.
export const CAR_MODELS: Record<string, string[]> = {
  'Aston Martin': ['DB11', 'DB12', 'DBS', 'DBX', 'DBX707', 'Vantage'],
  Audi: ['A4', 'A5', 'A6', 'A7', 'A8', 'Q5', 'Q7', 'Q8', 'e-tron GT', 'RS3', 'RS4', 'RS5', 'RS6 Avant', 'RS7', 'RS Q8', 'R8', 'S5', 'S6', 'S8', 'SQ7', 'SQ8'],
  Bentley: ['Bentayga', 'Continental GT', 'Continental GTC', 'Flying Spur'],
  BMW: ['3 Series', '5 Series', '7 Series', '8 Series', 'M2', 'M3', 'M4', 'M5', 'M8', 'X3', 'X4', 'X5', 'X5 M', 'X6', 'X6 M', 'X7', 'XM', 'i4', 'i5', 'i7', 'iX', 'Z4', '540i', 'M340i xDrive', 'M5 F90 Competition'],
  Cadillac: ['CT5', 'Escalade', 'Escalade ESV', 'Lyriq', 'XT6'],
  Dodge: ['Challenger', 'Charger', 'Durango'],
  Ferrari: ['296 GTB', '296 GTS', '812 Superfast', 'F8 Tributo', 'Purosangue', 'Roma', 'SF90 Stradale'],
  Genesis: ['G70', 'G80', 'G90', 'GV70', 'GV80'],
  Jaguar: ['F-Pace', 'F-Type', 'I-Pace', 'XF'],
  Lamborghini: ['Huracán', 'Revuelto', 'Urus', 'Urus S', 'Urus Performante'],
  'Land Rover': ['Defender 90', 'Defender 110', 'Defender 130', 'Discovery', 'Range Rover', 'Range Rover Sport', 'Range Rover Velar', 'Range Rover Evoque'],
  Lexus: ['ES', 'GX', 'IS', 'LC', 'LM', 'LS', 'LX', 'NX', 'RX'],
  'Li Auto': ['L6', 'L7', 'L8', 'L9', 'MEGA'],
  Maserati: ['Ghibli', 'GranTurismo', 'Grecale', 'Levante', 'MC20', 'Quattroporte'],
  McLaren: ['720S', '750S', 'Artura', 'GT'],
  'Mercedes-AMG': ['C 63', 'E 63', 'G 63', 'GLE 63', 'GLS 63', 'GT', 'GT 63 S 4-door', 'S 63', 'SL 63'],
  'Mercedes-Benz': ['C-Class', 'E-Class', 'S-Class', 'CLS', 'G-Class', 'G63 First Edition', 'GLC', 'GLE', 'GLE Coupe', 'GLS', 'Maybach S-Class', 'Maybach GLS', 'V-Class', 'EQS', 'EQE'],
  Porsche: ['718 Cayman', '718 Boxster', '911', '911 Turbo S', 'Cayenne', 'Cayenne Coupe', 'Cayenne S', 'Cayenne Turbo', 'Macan', 'Panamera', 'Taycan'],
  'Rolls-Royce': ['Cullinan', 'Ghost', 'Phantom', 'Spectre', 'Wraith', 'Dawn'],
  Tesla: ['Model 3', 'Model S', 'Model X', 'Model Y', 'Cybertruck'],
  Toyota: ['Camry', 'Land Cruiser 300', 'Land Cruiser Prado', 'Alphard', 'Sequoia', 'Tundra'],
  RAM: ['1500', '1500 TRX', '2500'],
  Zeekr: ['001', '007', '009', 'X'],
};

export const ENGINE_HINTS = ['бензин, 2.0 л', 'бензин, 3.0 л', 'бензин, 4.0 л', 'бензин, 4.4 л', 'бензин, 6.2 л', 'дизель, 3.0 л', 'дизель, 3.3 л', 'гибрид', 'электро', 'последовательный гибрид (EREV)'];
export const TRANSMISSION_HINTS = ['автомат', 'робот', 'вариатор', 'механика', 'редуктор (электро)'];
export const DRIVE_HINTS = ['полный', 'задний', 'передний'];
export const COLOR_HINTS = ['чёрный', 'белый', 'серый', 'серый металлик', 'серебристый', 'синий', 'тёмно-синий', 'красный', 'зелёный', 'матовый чёрный', 'бежевый', 'коричневый'];
