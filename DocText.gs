/**
 * DocText.gs: the wording of the two partner forms, shown to the parent on
 * screen before signing.
 *
 * This text is copied word for word from the 2026-2027 blank PDFs in the
 * templates folder (Digital Promise "End User Participation Agreement for
 * 2026-2027 School Year" and the "VILS Verizon General Release Form for
 * 2026-2027 School Year"). It belongs to those organisations. Do not reword or
 * translate it. If they send a new version, replace the blank PDF in Drive AND
 * update the text here so the screen and the PDF say the same thing.
 *
 * Each block is {h: heading} or {p: paragraph}. "{{end_user}}" is replaced by
 * the student's name (the student is the End User).
 */

var DP_TEXT_ = {
  title: 'END USER PARTICIPATION AGREEMENT FOR 2026-2027 SCHOOL YEAR',
  subtitle: '',
  blocks: [
    { p: 'This END USER PARTICIPATION AGREEMENT (this “Agreement”), effective as of the date executed below (“Effective Date”), is entered into by and between Digital Promise (the “Grantee”) and {{end_user}} (the “End User” or “you” or “Your”) collectively referred to herein as the “Parties.”' },
    { p: 'By your signature, you acknowledge and agree to the following:' },
    { h: 'PURPOSE' },
    { p: '1. You will receive a wireless device and service at no charge in order to facilitate your participation in the Verizon Innovative Learning Schools program. The wireless device has been donated by Digital Promise and service has been donated by Verizon Wireless and is provided to you by the Grantee under the terms and conditions of this Agreement. This Agreement may be terminated at any time by Verizon Wireless or Digital Promise for any reason. The term of this Agreement shall be from the date of execution by you until you are no longer an active participant in the program.' },
    { h: 'WIRELESS DEVICE AND SERVICE' },
    { p: '1. The wireless device is intended for your use alone, solely for purposes of the program, and it cannot be sold or transferred to any other person or entity. Verizon Wireless will provide voice and/or data service solely to facilitate your participation in the program; however, if you have excessive usage, make international calls/text messages with your wireless device, stream games, or stream audio/video other than in connection with the program, your service may be limited, slowed or terminated without notice. At the end of your participation in the study, Verizon Wireless will discontinue wireless service to the device and you agree to return the device to Grantee.' },
    { h: 'TREATMENT OF INFORMATION ASSOCIATED WITH USE OF THE DEVICE AND SERVICE' },
    { p: '1. Information about your use of the wireless device and service, including, but not limited to, details of when you used data services or placed calls and to whom, is information of the Grantee, as the customer of record for the device and service. Therefore, this information may be accessed by and shared with Grantee, and those parties to whom Grantee authorizes, including the Verizon Corporate Resource Group LLC (“VCRG”). No personally identifiable information or content will be accessible by VCRG.' },
    { h: 'FAILURE AND/OR DISRUPTION OF SERVICES' },
    { p: '1. Cellco Partnership d/b/a Verizon Wireless (“Verizon Wireless”) or its vendors and suppliers shall have no liability whatsoever for End User’s losses, claims or damages for any cause whatsoever, including direct, indirect, special, consequential, treble or punitive damages, or for limitations in service, including but not limited to, any failure or disruption of services provided hereunder, regardless of the form of action, whether in contract or in tort or otherwise. This limitation includes losses, damages, claims or expenses of any kind arising out of the use or attempted use of the services, or inability to access life support or monitoring systems or devices, 911 or E911 or other emergency call or service. You shall not be deemed a third-party beneficiary of any contract between the Grantee and Verizon Wireless.' },
    { h: 'ARBITRATION' },
    { p: '1. END USER AGREES THAT, TO THE FULLEST EXTENT PROVIDED BY LAW:' },
    { p: '(i) ANY CONTROVERSY OR CLAIM ARISING OUT OF OR RELATING TO THIS AGREEMENT, OR TO ANY DEVICE OR SERVICE PROVIDED UNDER OR IN CONNECTION WITH THIS AGREEMENT, WILL BE SETTLED BY INDEPENDENT ARBITRATION INVOLVING A NEUTRAL ARBITRATOR AND ADMINISTERED BY THE AMERICAN ARBITRATION ASSOCIATION (“AAA”) UNDER WIRELESS INDUSTRY ARBITRATION (“WIA”) RULES, AS MODIFIED BY THIS AGREEMENT. WIA RULES AND FEE INFORMATION ARE AVAILABLE FROM THE AAA at www.adr.org. ARBITRATION IS NOT A COURT PROCEEDING. THE RULES OF ARBITRATION DIFFER FROM THE RULES OF COURT. THERE IS NO JUDGE OR JURY IN AN ARBITRATION PROCEEDING. THIS ARBITRATION CLAUSE SHALL APPLY TO ANY CLAIMS THAT END USER MIGHT SEEK TO ASSERT AGAINST GRANTEE OR VERIZON WIRELESS AND TO ANY CLAIMS THAT GRANTEE OR VERIZON WIRELESS MIGHT SEEK TO ASSERT AGAINST END USER. VERIZON WIRELESS IS A THIRD PARTY BENEFICIARY OF THIS AGREEMENT FOR SUCH PURPOSE.' },
    { p: '(ii) The Federal Arbitration Act applies to this Agreement. EVEN IF APPLICABLE LAW PERMITS CLASS ACTIONS OR CLASS ARBITRATIONS, END USER WAIVES ANY RIGHT TO PURSUE ON A CLASS BASIS ANY SUCH CONTROVERSY OR CLAIM AGAINST GRANTEE OR VERIZON WIRELESS, OR ANY OF THEIR AFFILIATES OR PREDECESSORS IN INTEREST. If multiple claims are joined in one action, some of which would not be subject to arbitration, the latter claims must be stayed until any claims in that action that are subject to arbitration have been resolved. If claims are asserted against multiple parties, some of whom are not required to arbitrate, the claims subject to arbitration must be severed; However, End User retains his/her right to file a complaint with any regulatory agency or commission.' },
    { p: '(iii) No arbitrator has authority to award relief in excess of what this Agreement provides, or to order consolidation or class arbitration, except that an arbitrator deciding a claim arising out of or relating to a prior agreement may grant as much substantive relief on a non-class basis as such prior agreement would permit. In all arbitrations, the arbitrator must give effect to applicable statutes of limitations and will decide whether an issue is arbitrable or not. In a Large/Complex Case arbitration, the arbitrators must also apply the Federal Rules of Evidence and the losing party may have the award reviewed by a review panel consisting of three (3) arbitrators.' }
  ],
  checklistIntro: 'Please read carefully and initial next to each statement if you agree. In order to receive the device you will need to initial next to ALL statements.',
  checklist: [
    'I understand that I need to monitor my data usage so that it does not exceed 30 GB per month and that I may not stream audio or video except in connection with the program, and that I may not stream games.',
    'I agree not to download any billable or paid applications (apps) except those that are provided by my school.',
    'I agree not to use the personal hotspot on the device or allow any other devices to access the device’s personal hotspot.',
    'I agree not to remove any hardware (i.e. SIM chip) or software from the device unless authorized by VCRG or Verizon Wireless.',
    'I agree to use my assigned device only within the 50 states of the United States of America.',
    'I agree not to make international calls or send international text, video or picture messages, including calls and messages to Canada and Mexico.',
    'If my assigned wireless device is damaged, lost or stolen, I agree to report it immediately to the District Lead.',
    'I understand that if my device becomes inoperable due to a manufacturer’s defect, I will return the device to the school and exchange it for an operating device. I understand that if I receive a device and it is lost, stolen or damaged, including a cracked screen, I may have limited use of the device in accordance with school procedures.',
    'I understand that Digital Promise, Verizon Wireless or VCRG can suspend or terminate service at any time, without notice.'
  ],
  checklistClosing: 'I understand if I violate any of these terms, I may be required to return my assigned wireless device to the Principal who will return it to the District Lead.'
};

var VZ_TEXT_ = {
  title: 'General Release',
  subtitle: 'VILS Verizon General Release Form For 2026-2027 School Year',
  blocks: [
    { p: 'I grant Verizon Licensing Company, its affiliates, successors, assigns, and licensees (“Verizon”) the following rights:' },
    { p: '1. I grant Verizon the right to take photographs and videos of me and my image and likeness and record or otherwise take my voice for testimonials and other statements (“Photography”).' },
    { p: '2. I also grant Verizon the right to edit and use the Photography at any time and in any way whatsoever, for any purpose, and in any manner and medium, including but not limited to, advertising, publicity or promotional material, in print, video, television, radio, or any other media, electronic or otherwise, including websites and the Internet, and to use quotations and soundtrack recordings of me or my voice in connection with the use of the Photography.' },
    { p: '3. I waive any right to inspect or approve the Photography or how the Photography is used and further waive any claim that I may have with respect to its use.' },
    { p: '4. I acknowledge that I will not receive any compensation other than any publicity that I may receive relating to the use of the Photography.' },
    { p: '5. I forever release and discharge, and agree to hold harmless Verizon and its directors, officers, agents, employees, shareholders and representatives from any and all liability for any violation of any personal rights (including right of privacy and right of publicity), intellectual property rights or any other rights which I may have arising out of or in connection with Verizon’s use of the Photography.' },
    { p: '6. I represent and warrant that I am of full age and have every right to contract in my own name in the above regard.' }
  ],
  // The form's own answer: "I hereby: [ ] Agree and Consent  [ ] DO NOT Consent". Either answer completes the form.
  choiceLabel: 'I hereby:',
  choices: { agree: 'Agree and Consent', decline: 'DO NOT Consent' }
};
