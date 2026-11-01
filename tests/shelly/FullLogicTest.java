package za.co.farrusco.farrqcharge;
class FL {  // run: javac -d out app/src/main/java/za/co/farrusco/farrqcharge/FullLogic.java tests/shelly/FullLogicTest.java && java -cp out za.co.farrusco.farrqcharge.FL
  static int fail=0;
  static void ck(boolean c,String m){ if(!c){fail++;System.out.println("FAIL "+m);} else System.out.println("ok   "+m); }
  static FullLogic.State st(long end){ FullLogic.State s=new FullLogic.State(); s.endMs=end; return s; }
  public static void main(String[] a){
    long E=1_000_000_000L, M=60_000L;
    FullLogic.RelayReader on=()->FullLogic.RELAY_BOTH_ON, off=()->FullLogic.RELAY_NOT_BOTH_ON, bad=()->FullLogic.RELAY_UNREAD;
    // full charge: 0 W, relays ON at 1.5 min, still ON at 5 min
    FullLogic.State s=st(E);
    ck(FullLogic.step(s,E+90_000,false,0,on)==null,"1.5 min: still watching");
    ck(FullLogic.step(s,E+4*M,false,0,on)==null,"4 min: still watching");
    ck("full".equals(FullLogic.step(s,E+5*M,false,0,on)),"5 min, relays ON: full");
    // relay off at first look = not full
    ck("not_full".equals(FullLogic.step(st(E),E+90_000,false,0,off)),"relay off when the car stopped: not full");
    // relay switched off during the 5 minutes = unsure
    s=st(E); FullLogic.step(s,E+90_000,false,0,on);
    ck("unsure".equals(FullLogic.step(s,E+5*M,false,0,off)),"relay off before 5 min: unsure");
    // car draws power again = pause = not full
    s=st(E); FullLogic.step(s,E+90_000,false,0,on);
    ck("not_full".equals(FullLogic.step(s,E+3*M,true,2600,on)),"charging again: not full");
    // still drawing 40 W: keeps watching and never decides full
    s=st(E);
    ck(FullLogic.step(s,E+6*M,false,40,on)==null,"40 W: watching");
    ck("unsure".equals(FullLogic.step(s,E+21*M,false,40,on)),"40 W for 20 min: unsure");
    // relay board unreadable
    s=st(E);
    ck(FullLogic.step(s,E+90_000,false,0,bad)==null,"relay unreadable first: retry");
    ck(FullLogic.step(s,E+2*M,false,0,on)==null,"then readable: watching");
    ck("full".equals(FullLogic.step(s,E+5*M+1,false,0,on)),"then full at 5 min");
    s=st(E); FullLogic.step(s,E+90_000,false,0,on);
    ck(FullLogic.step(s,E+5*M,false,0,bad)==null,"unreadable at 5 min: retry");
    ck("unsure".equals(FullLogic.step(s,E+11*M,false,0,bad)),"unreadable for 10 min after: unsure");
    // exactly 25 W counts as zero
    s=st(E); FullLogic.step(s,E+90_000,false,25,on);
    ck("full".equals(FullLogic.step(s,E+5*M,false,25,on)),"25 W counts as zero");
    // 5% battery check: start 20%, 42.7 kWh pack, 10% loss
    // to reach 100% the wall must deliver 80% * 42.7 * 1.1 = 37.576 kWh
    ck(FullLogic.withinTolerance(20,37.6,42.7,10,5),"exact full: counts");
    ck(FullLogic.withinTolerance(20,36.0,42.7,10,5),"4% short: counts");
    ck(!FullLogic.withinTolerance(20,34.0,42.7,10,5),"9% short: unsure");
    ck(!FullLogic.withinTolerance(20,40.5,42.7,10,5),"7% over: unsure");
    ck(FullLogic.withinTolerance(90,4.8,42.7,10,5),"90% start, 4.8 kWh: counts");
    ck(!FullLogic.withinTolerance(90,1.0,42.7,10,5),"90% start, 1 kWh: unsure");
    System.out.println(fail==0?"ALL PASS":"FAILURES: "+fail); System.exit(fail==0?0:1);
  }
}
