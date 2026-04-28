/**
 * Top 200 most common passwords from breach databases.
 * Blocks the easiest brute-force / dictionary attacks.
 * If a user picks one of these, we reject regardless of length.
 */
export const COMMON_PASSWORDS = new Set([
  '123456', '123456789', 'qwerty', 'password', '12345', 'qwerty123', '1q2w3e',
  '12345678', '111111', '1234567890', '1234567', 'abc123', '654321', 'password1',
  '123123', 'admin', '666666', '987654321', 'iloveyou', 'qazwsx', 'zaq12wsx',
  '00000000', '123', '999999', 'monkey', '7777777', '0000000000', 'qwertyuiop',
  '888888', 'pass1234', '1qaz2wsx', '1q2w3e4r', 'aa123456', 'asdfghjkl',
  '777777', '147258369', 'ohmnamah23', '1234', '0000', '11111111', 'asd123',
  '123qwe', 'qwerty1', '123321', 'masterkey', 'admin123', 'asdfgh', 'aaaaaa',
  'computer', 'whatever', 'master', 'football', 'shadow', 'baseball', 'jordan',
  'superman', 'harley', 'fuckyou', 'trustno1', 'liverpool', 'killer', 'soccer',
  'jennifer', 'joshua', 'maggie', 'starwars', 'silver', 'william', 'dakota',
  'thomas', 'jasmine', 'andrew', 'orange', 'merlin', 'michelle', 'corvette',
  'bigdog', 'cheese', 'matthew', 'access', 'yankees', '987654', 'dallas',
  'austin', 'thunder', 'taylor', 'matrix', 'mobilemail', 'mom', 'monitor',
  'monitoring', 'montana', 'moon', 'moscow', 'sunshine', 'ashley', 'bailey',
  'batman', 'charlie', 'donald', 'freedom', 'hunter', 'letmein', 'login',
  'mustang', 'pepper', 'qwerty12', 'robert', 'tigger', 'welcome', 'jesus',
  'ninja', 'mickey', 'flower', 'iloveu', 'nicole', 'asdf', 'asdfg', 'baby',
  'angel', 'love', 'lovely', 'family', 'pokemon', 'samsung', 'apple', 'google',
  'photoshop', 'snoopy', 'naruto', 'cookie', 'spider', 'horse', 'fucker',
  'scooby', 'tinkerbell', 'patrick', 'whatever1', 'amanda', 'sasha', 'natasha',
  'jessica', 'samantha', 'megan', 'rachel', 'becky', 'sarah', 'emily',
  '111222', '321321', '112233', '252525', 'qq11qq11', 'andrey', 'snickers',
  'forest', 'fluffy', 'jasper', 'killer1', 'iloveyou1', 'iloveyou2', 'shadow1',
  'tigger1', 'jessica1', 'jordan1', 'jennifer1', 'pepper1', 'jasmine1',
  'mickey1', 'samantha1', 'changeme', 'changeme1', 'changeme123', 'changepass',
  'temp123', 'temppass', 'temporary', 'guest', 'guest123', 'admin1', 'admin12',
  'administrator', 'root', 'root123', 'toor', 'test', 'test123', 'test1234',
  'demo', 'demo123', 'user', 'user123', 'login123', 'pass', 'passw0rd',
  'p@ssw0rd', 'p@ssword', 'pa$$w0rd', 'pa$$word', 'p4ssw0rd', 'qwerty!',
  'azerty', 'azerty123', 'football1', 'baseball1', 'soccer1', 'computer1',
  'welcome1', 'welcome123', 'qwerty123!', 'password123', 'password!', 'password1!',
  'perenne', 'perennenote', 'perennebusiness', 'business', 'stelvio', 'company',
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
