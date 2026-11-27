Nội dung tuỳ chỉnh, đóng gói vào web-ghcr/custom-pack.zip (mọi người chơi đều tải, kể cả khi tắt HD).

Model nhân vật (phải có CÙNG file ở server qua mount trong docker-compose.122.yml và ở client qua
custom-pack.zip; lệch file thì server CS kiểm tra model và có thể crash):
  models/player/leet/leet.mdl   Angelina (CSO)       thay Elite Crew  (Scambodia / T, số 2)
                                nguồn: [CSO]Angelina_customized/models/buffclass24s2tr.mdl
                                bản tóc dài: buffclass24s2tr_LongHair.mdl
  models/player/gsg9/gsg9.mdl   Choi Ji Yoon (CSO)   thay GSG-9       (zSafety / CT, số 2)
                                nguồn: [CSO]Princess Choi Ji Yoon/model/buffclass24s4ct.mdl

Tên 2 phe (chỉ cần ở client): CT -> zSafety, T -> Scambodia
  resource/cstrike_english.txt, titles.txt  sinh bằng rename_teams.py từ file gốc trong gamefiles-lite.zip

Đóng gói lại sau khi sửa:
  cd custom && zip -9 -rq ../web-ghcr/custom-pack.zip.new cstrike && cat ../web-ghcr/custom-pack.zip.new > ../web-ghcr/custom-pack.zip && rm ../web-ghcr/custom-pack.zip.new
(ghi đè bằng cat để giữ nguyên file đang được mount vào container)
