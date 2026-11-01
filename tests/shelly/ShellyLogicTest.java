package za.co.farrusco.farrqcharge;
import java.util.*;
public class T {  // class name kept as T so the run line above works
  static int fail=0;
  static void ck(boolean c,String m){ if(!c){fail++;System.out.println("FAIL "+m);} else System.out.println("ok   "+m); }
  static List<ShellyLogic.Minute> run(long t0,double[] w){ List<ShellyLogic.Minute> l=new ArrayList<>(); for(int i=0;i<w.length;i++) l.add(new ShellyLogic.Minute(t0+i*60L,w[i]/60.0,w[i])); return l; }
  public static void main(String[] a){
    long t0=1761050000L; ShellyLogic.State st=new ShellyLogic.State();
    // idle, 5 min charge at 3000 W, idle
    double[] w={0,0,10,3000,3000,3000,3000,3000,20,0};
    List<ShellyLogic.Done> d=ShellyLogic.feed(st,run(t0,w),100,50,1.0);
    ck(d.size()==1,"one session");
    ck(Math.abs(d.get(0).wh-(5*50+20/60.0))<0.01,"energy 250 Wh + tail: "+d.get(0).wh);
    ck(d.get(0).startTs==t0+3*60,"start minute");
    ck(d.get(0).endTs==t0+8*60+60,"end after below minute");
    ck(d.get(0).reason.equals("below_threshold"),"reason");
    ck(!st.open,"closed");
    // feeding same minutes again changes nothing
    ck(ShellyLogic.feed(st,run(t0,w),100,50,1.0).size()==0,"no double count");
    // running session across two calls
    ShellyLogic.State s2=new ShellyLogic.State();
    ShellyLogic.feed(s2,run(t0,new double[]{0,3000,3000}),100,50,1.0);
    ck(s2.open&&s2.minutes==2,"open after 2 minutes");
    ck(Math.abs(ShellyLogic.runningKwh(s2,3000,t0+3*60+30)-(100+25)/1000.0)<0.001,"running kwh incl partial");
    List<ShellyLogic.Minute> more=new ArrayList<>(); more.add(new ShellyLogic.Minute(t0+3*60,0,0));
    List<ShellyLogic.Done> d2=ShellyLogic.feed(s2,more,100,50,1.0);
    ck(d2.size()==1&&Math.abs(d2.get(0).wh-100)<0.01,"closes on next call: "+d2.get(0).wh);
    // power cut gap while charging
    ShellyLogic.State s3=new ShellyLogic.State();
    List<ShellyLogic.Minute> g=run(t0,new double[]{3000,3000});
    g.add(new ShellyLogic.Minute(t0+20*60,0,0)); g.add(new ShellyLogic.Minute(t0+21*60,0,0));
    List<ShellyLogic.Done> d3=ShellyLogic.feed(s3,g,100,50,1.0);
    ck(d3.size()==1&&d3.get(0).reason.equals("meter_gap")&&d3.get(0).endTs==t0+120,"gap closes session");
    // calibration
    ShellyLogic.State s4=new ShellyLogic.State();
    List<ShellyLogic.Done> d4=ShellyLogic.feed(s4,run(t0,new double[]{3000,3000,0}),100,50,1.02);
    ck(Math.abs(d4.get(0).wh-102)<0.01,"cal factor applied: "+d4.get(0).wh);
    // below start never opens
    ShellyLogic.State s5=new ShellyLogic.State();
    ck(ShellyLogic.feed(s5,run(t0,new double[]{60,90,99,40}),100,50,1.0).size()==0&&!s5.open,"standby never starts");
    // taper: 3000 then 700 then 60 (above end) then 30
    ShellyLogic.State s6=new ShellyLogic.State();
    List<ShellyLogic.Done> d6=ShellyLogic.feed(s6,run(t0,new double[]{3000,700,60,30}),100,50,1.0);
    ck(d6.size()==1&&d6.get(0).minutes==4,"taper stays in session until <50 W");
    System.out.println(fail==0?"ALL PASS":"FAILURES "+fail);
    System.exit(fail==0?0:1);
  }
}
